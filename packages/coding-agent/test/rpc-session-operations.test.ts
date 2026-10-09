import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentSessionRuntime } from "../src/core/agent-session-runtime.ts";
import { type SessionInfo, SessionManager } from "../src/core/session-manager.ts";
import { RpcClient } from "../src/modes/rpc/rpc-client.ts";
import { runRpcMode } from "../src/modes/rpc/rpc-mode.ts";
import type { RpcResponse } from "../src/modes/rpc/rpc-types.ts";
import { createHarness, type Harness } from "./suite/harness.ts";
import { assistantMsg, userMsg } from "./utilities.ts";

const rpcIo = vi.hoisted(() => ({
	outputLines: [] as string[],
	lineHandler: undefined as ((line: string) => void) | undefined,
}));

vi.mock("../src/core/output-guard.js", () => ({
	flushRawStdout: vi.fn(async () => {}),
	takeOverStdout: vi.fn(),
	waitForRawStdoutBackpressure: vi.fn(async () => {}),
	writeRawStdout: (line: string) => {
		rpcIo.outputLines.push(line);
	},
}));

vi.mock("../src/modes/interactive/theme/theme.js", () => ({ theme: {} }));

vi.mock("../src/modes/rpc/jsonl.js", () => ({
	attachJsonlLineReader: vi.fn((_stream: NodeJS.ReadableStream, onLine: (line: string) => void) => {
		rpcIo.lineHandler = onLine;
		return () => {
			rpcIo.lineHandler = undefined;
		};
	}),
	serializeJsonLine: (value: unknown) => `${JSON.stringify(value)}\n`,
}));

type NodeListener = Parameters<typeof process.on>[1];

type ListenerSnapshot = {
	stdinEnd: NodeListener[];
	signals: Map<NodeJS.Signals, NodeListener[]>;
};

type RpcClientPrivate = {
	send: (command: Record<string, unknown>) => Promise<RpcResponse>;
	getData: <T>(response: RpcResponse) => T;
};

const cleanups: Array<() => void> = [];

function createTempDir(): string {
	const dir = join(tmpdir(), `pi-rpc-session-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	cleanups.push(() => {
		if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
	});
	return dir;
}

function takeListenerSnapshot(): ListenerSnapshot {
	const signals: NodeJS.Signals[] = process.platform === "win32" ? ["SIGTERM"] : ["SIGTERM", "SIGHUP"];
	return {
		stdinEnd: process.stdin.listeners("end") as NodeListener[],
		signals: new Map(signals.map((signal) => [signal, process.listeners(signal) as NodeListener[]])),
	};
}

function restoreListeners(snapshot: ListenerSnapshot): void {
	for (const listener of process.stdin.listeners("end") as NodeListener[]) {
		if (!snapshot.stdinEnd.includes(listener)) process.stdin.off("end", listener);
	}
	for (const [signal, previousListeners] of snapshot.signals) {
		for (const listener of process.listeners(signal) as NodeListener[]) {
			if (!previousListeners.includes(listener)) process.off(signal, listener);
		}
	}
}

function createRuntimeHost(harness: Harness): AgentSessionRuntime {
	return {
		session: harness.session,
		newSession: vi.fn(async () => ({ cancelled: true })),
		switchSession: vi.fn(async () => ({ cancelled: true })),
		fork: vi.fn(async () => ({ cancelled: true, selectedText: "" })),
		dispose: vi.fn(async () => {}),
		setRebindSession: vi.fn(),
	} as unknown as AgentSessionRuntime;
}

async function startRpc(harness: Harness): Promise<ListenerSnapshot> {
	const snapshot = takeListenerSnapshot();
	rpcIo.outputLines = [];
	rpcIo.lineHandler = undefined;
	void runRpcMode(createRuntimeHost(harness));
	await vi.waitFor(() => expect(rpcIo.lineHandler).toBeDefined());
	return snapshot;
}

function parseResponses(): RpcResponse[] {
	return rpcIo.outputLines
		.flatMap((line) => line.split("\n"))
		.filter(Boolean)
		.map((line) => JSON.parse(line) as RpcResponse)
		.filter((record) => record.type === "response");
}

async function sendCommand(command: Record<string, unknown>): Promise<RpcResponse> {
	rpcIo.lineHandler?.(JSON.stringify(command));
	await vi.waitFor(() => {
		expect(parseResponses().some((response) => response.id === command.id)).toBe(true);
	});
	const response = parseResponses().find((candidate) => candidate.id === command.id);
	if (!response) throw new Error(`Missing RPC response for ${String(command.id)}`);
	return response;
}

function appendPersistedConversation(
	manager: SessionManager,
	firstMessage: string,
	modified: number,
	name?: string,
): void {
	manager.appendMessage({ role: "user", content: firstMessage, timestamp: modified - 1 });
	manager.appendMessage({ ...assistantMsg(`reply to ${firstMessage}`), timestamp: modified });
	if (name) manager.appendSessionInfo(name);
}

function toRpcSessionInfo(info: SessionInfo): Record<string, unknown> {
	return JSON.parse(
		JSON.stringify({
			path: info.path,
			id: info.id,
			cwd: info.cwd,
			name: info.name,
			parentSessionPath: info.parentSessionPath,
			created: info.created.toISOString(),
			modified: info.modified.toISOString(),
			messageCount: info.messageCount,
			firstMessage: info.firstMessage,
			allMessagesText: info.allMessagesText,
		}),
	) as Record<string, unknown>;
}

function createBranchedSession(
	cwd: string,
	sessionDir: string,
): {
	manager: SessionManager;
	targetId: string;
	parentId: string;
	entryIds: string[];
} {
	const manager = SessionManager.create(cwd, sessionDir);
	manager.appendMessage(userMsg("root"));
	const parentId = manager.appendMessage(assistantMsg("root reply"));
	const targetId = manager.appendMessage(userMsg("main branch prompt"));
	manager.appendMessage(assistantMsg("main branch reply"));
	manager.branch(parentId);
	manager.appendMessage(userMsg("active branch prompt"));
	manager.appendMessage(assistantMsg("active branch reply"));
	return { manager, targetId, parentId, entryIds: manager.getEntries().map((entry) => entry.id) };
}

afterEach(() => {
	rpcIo.outputLines = [];
	rpcIo.lineHandler = undefined;
	while (cleanups.length > 0) cleanups.pop()?.();
	vi.restoreAllMocks();
});

describe("RPC session operations", () => {
	it("lists only current-project sessions in SessionManager.list order with wire-safe fields", async () => {
		const root = createTempDir();
		const projectA = join(root, "project-a");
		const projectB = join(root, "project-b");
		const sessionDir = join(root, "sessions");
		mkdirSync(projectA, { recursive: true });
		mkdirSync(projectB, { recursive: true });

		const older = SessionManager.create(projectA, sessionDir, { parentSession: join(root, "parent.jsonl") });
		appendPersistedConversation(older, "older request", Date.parse("2025-01-02T00:00:00.000Z"), "Older");
		const newer = SessionManager.create(projectA, sessionDir);
		appendPersistedConversation(newer, "newer request", Date.parse("2025-01-03T00:00:00.000Z"));
		const otherProject = SessionManager.create(projectB, sessionDir);
		appendPersistedConversation(otherProject, "other project", Date.parse("2025-01-04T00:00:00.000Z"));

		const expected = await SessionManager.list(projectA, sessionDir);
		expect(expected.map((info) => info.path)).toEqual([newer.getSessionFile(), older.getSessionFile()]);
		const listSpy = vi.spyOn(SessionManager, "list");
		const harness = await createHarness({ sessionManager: newer });
		cleanups.push(harness.cleanup);
		const listeners = await startRpc(harness);
		cleanups.push(() => restoreListeners(listeners));

		const response = await sendCommand({ id: "list-1", type: "list_sessions" });

		expect(listSpy).toHaveBeenCalledWith(newer.getCwd(), newer.getSessionDir());
		expect(response).toEqual({
			id: "list-1",
			type: "response",
			command: "list_sessions",
			success: true,
			data: { sessions: expected.map(toRpcSessionInfo) },
		});
		if (response.success && response.command === "list_sessions") {
			for (const info of response.data.sessions) {
				expect(new Date(info.created).toISOString()).toBe(info.created);
				expect(new Date(info.modified).toISOString()).toBe(info.modified);
			}
		}
	});

	it("navigates a branched session without provider access and preserves abandoned entries", async () => {
		const root = createTempDir();
		const project = join(root, "project");
		const sessionDir = join(root, "sessions");
		mkdirSync(project, { recursive: true });
		const { manager, targetId, parentId, entryIds } = createBranchedSession(project, sessionDir);
		const harness = await createHarness({ sessionManager: manager, withConfiguredAuth: false });
		cleanups.push(harness.cleanup);
		const listeners = await startRpc(harness);
		cleanups.push(() => restoreListeners(listeners));

		const response = await sendCommand({
			id: "navigate-1",
			type: "navigate_tree",
			targetId,
			summarize: false,
		});

		expect(response).toEqual({
			id: "navigate-1",
			type: "response",
			command: "navigate_tree",
			success: true,
			data: { cancelled: false, editorText: "main branch prompt" },
		});
		expect(manager.getLeafId()).toBe(parentId);
		expect(manager.getEntries().map((entry) => entry.id)).toEqual(entryIds);
	});

	it("returns successful extension cancellation without mutating entries or leaf", async () => {
		const root = createTempDir();
		const project = join(root, "project");
		mkdirSync(project, { recursive: true });
		const { manager, targetId } = createBranchedSession(project, join(root, "sessions"));
		const entriesBefore = manager.getEntries();
		const leafBefore = manager.getLeafId();
		const harness = await createHarness({
			sessionManager: manager,
			withConfiguredAuth: false,
			extensionFactories: [
				(pi) => {
					pi.on("session_before_tree", () => ({ cancel: true }));
				},
			],
		});
		cleanups.push(harness.cleanup);
		const listeners = await startRpc(harness);
		cleanups.push(() => restoreListeners(listeners));

		const response = await sendCommand({
			id: "navigate-cancel",
			type: "navigate_tree",
			targetId,
			summarize: false,
		});

		expect(response).toEqual({
			id: "navigate-cancel",
			type: "response",
			command: "navigate_tree",
			success: true,
			data: { cancelled: true },
		});
		expect(manager.getEntries()).toEqual(entriesBefore);
		expect(manager.getLeafId()).toBe(leafBefore);
	});

	it("correlates unknown-target failures without mutating the session", async () => {
		const root = createTempDir();
		const project = join(root, "project");
		mkdirSync(project, { recursive: true });
		const { manager } = createBranchedSession(project, join(root, "sessions"));
		const entriesBefore = manager.getEntries();
		const leafBefore = manager.getLeafId();
		const harness = await createHarness({ sessionManager: manager, withConfiguredAuth: false });
		cleanups.push(harness.cleanup);
		const listeners = await startRpc(harness);
		cleanups.push(() => restoreListeners(listeners));

		const response = await sendCommand({
			id: "navigate-missing",
			type: "navigate_tree",
			targetId: "missing-entry",
			summarize: false,
		});

		expect(response).toEqual({
			id: "navigate-missing",
			type: "response",
			command: "navigate_tree",
			success: false,
			error: "Entry missing-entry not found",
		});
		expect(manager.getEntries()).toEqual(entriesBefore);
		expect(manager.getLeafId()).toBe(leafBefore);
	});

	it("forwards navigation options and preserves an aborted result", async () => {
		const root = createTempDir();
		const project = join(root, "project");
		mkdirSync(project, { recursive: true });
		const manager = SessionManager.create(project, join(root, "sessions"));
		const harness = await createHarness({ sessionManager: manager, withConfiguredAuth: false });
		cleanups.push(harness.cleanup);
		const navigateTree = vi
			.spyOn(harness.session, "navigateTree")
			.mockResolvedValue({ cancelled: true, aborted: true });
		const listeners = await startRpc(harness);
		cleanups.push(() => restoreListeners(listeners));

		const response = await sendCommand({
			id: "navigate-options",
			type: "navigate_tree",
			targetId: "target",
			summarize: true,
			customInstructions: "custom",
			replaceInstructions: true,
			label: "label",
		});

		expect(navigateTree).toHaveBeenCalledWith("target", {
			summarize: true,
			customInstructions: "custom",
			replaceInstructions: true,
			label: "label",
		});
		expect(response).toEqual({
			id: "navigate-options",
			type: "response",
			command: "navigate_tree",
			success: true,
			data: { cancelled: true, aborted: true },
		});
	});

	it("provides typed client methods for both commands", async () => {
		const client = new RpcClient();
		const privateClient = client as unknown as RpcClientPrivate;
		const send = vi
			.fn<(command: Record<string, unknown>) => Promise<RpcResponse>>()
			.mockResolvedValueOnce({
				type: "response",
				command: "list_sessions",
				success: true,
				data: { sessions: [] },
			})
			.mockResolvedValueOnce({
				type: "response",
				command: "navigate_tree",
				success: true,
				data: { cancelled: false, editorText: "draft" },
			});
		privateClient.send = send;
		privateClient.getData = <T>(response: RpcResponse): T => {
			if (!response.success || !("data" in response)) throw new Error("Expected data response");
			return response.data as T;
		};

		await expect(client.listSessions()).resolves.toEqual([]);
		await expect(
			client.navigateTree("target", {
				summarize: true,
				customInstructions: "custom",
				replaceInstructions: true,
				label: "label",
			}),
		).resolves.toEqual({ cancelled: false, editorText: "draft" });
		expect(send).toHaveBeenNthCalledWith(1, { type: "list_sessions" });
		expect(send).toHaveBeenNthCalledWith(2, {
			type: "navigate_tree",
			targetId: "target",
			summarize: true,
			customInstructions: "custom",
			replaceInstructions: true,
			label: "label",
		});
	});
});
