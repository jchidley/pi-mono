import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { buildReviewRequest } from "./pi-update-jev-request.mjs";

test("batches one scoped judgment per item without sending qualification labels", () => {
	const cases = JSON.parse(readFileSync(new URL("./pi-update-jev-cases.json", import.meta.url), "utf8"));
	const request = buildReviewRequest(cases);
	assert.equal(request.model, "jev-latest");
	assert.equal(Object.keys(request.questions).length, cases.length);
	for (const [index, item] of cases.entries()) {
		const field = `item_${index}`;
		assert.deepEqual(request.state[field], { claim: item.claim, evidence: item.evidence });
		assert.deepEqual(Object.keys(request.state[field]), ["claim", "evidence"]);
		assert.equal(request.questions[field].type, "choice");
		assert.match(request.questions[field].instructions, new RegExp(`${field}\\.evidence`));
		assert.deepEqual(Object.keys(request.questions[field].criteria), ["supported", "contradicted", "insufficient"]);
	}
});

test("rejects missing, empty, excessive and oversized evidence instead of truncating", () => {
	for (const items of [null, [], [null], [{}], [{ claim: 1, evidence: "text" }], [{ claim: "text", evidence: 1 }], [{ claim: "claim", evidence: " " }], Array(33).fill({ claim: "x", evidence: "y" }),
		[{ claim: "x", evidence: "y".repeat(65536) }]]) {
		assert.throws(() => buildReviewRequest(items));
	}
});

test("request limit counts UTF-8 bytes rather than characters", () => {
	const item = { claim: "x", evidence: "é".repeat(32000) };
	const request = buildReviewRequest([item]);
	assert.ok(Buffer.byteLength(JSON.stringify(request)) <= 65536);
	assert.throws(() => buildReviewRequest([{ claim: "x", evidence: "é".repeat(33000) }]), /64 KiB/);
});

test("CLI emits a request and rejects missing arguments, files and malformed JSON", (t) => {
	const path = mkdtempSync(join(tmpdir(), "jev-request-test-"));
	t.after(() => rmSync(path, { recursive: true, force: true }));
	const script = fileURLToPath(new URL("./pi-update-jev-request.mjs", import.meta.url));
	const file = join(path, "input.json");
	writeFileSync(file, JSON.stringify([{ claim: 'The word "expected" appears.', evidence: '"expected"', expected: "supported" }]));
	const invoke = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
	const result = invoke(file);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(Object.keys(JSON.parse(result.stdout).state.item_0), ["claim", "evidence"]);
	assert.equal(invoke().status, 1);
	assert.equal(invoke(join(path, "missing.json")).status, 1);
	writeFileSync(file, "{");
	assert.equal(invoke(file).status, 1);
});
