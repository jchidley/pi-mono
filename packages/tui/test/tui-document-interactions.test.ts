import assert from "node:assert/strict";
import { it } from "node:test";
import { ScrollView } from "../src/components/scroll-view.ts";
import { Text } from "../src/components/text.ts";
import { VStack } from "../src/components/v-stack.ts";
import { TuiAltScreen } from "../src/tui-alt-screen.ts";
import { VirtualTerminal } from "./virtual-terminal.ts";

it("resets document search and selection without closing unrelated overlays or losing editor input", async () => {
	const terminal = new VirtualTerminal(100, 12);
	const copied: string[] = [];
	const tui = new TuiAltScreen(terminal, undefined, undefined, {
		copyOnSelect: false,
		copySelection: async (text) => {
			copied.push(text);
			return true;
		},
	});
	const text = new Text("old document needle", 0, 0);
	const inputs: string[] = [];
	const editor = { render: () => ["editor"], invalidate: () => {}, handleInput: (data: string) => inputs.push(data) };
	tui.setLayoutRoot(
		new VStack([
			{ component: new ScrollView(text, { follow: "end", primary: true }), basis: 0, grow: 1 },
			{ component: editor, basis: 1 },
		]),
	);
	tui.setFocus(editor);
	tui.start();
	try {
		await terminal.waitForRender();
		terminal.sendInput("\x1b[<0;1;1M");
		terminal.sendInput("\x1b[<32;12;1M");
		terminal.sendInput("\x1b[<0;12;1m");
		assert.equal(await tui.copyActiveSelectionToClipboard(), true);
		assert.deepEqual(copied, ["old document"]);
		const overlay = tui.showOverlay(new Text("unrelated overlay", 0, 0), {
			nonCapturing: true,
			anchor: "bottom-left",
		});
		terminal.sendInput("\x1b[102;6u");
		terminal.sendInput("needle");
		await terminal.waitForRender();
		assert.match(terminal.getViewport().join("\n"), /1\/1/);
		tui.resetDocumentInteractions();
		text.setText("replacement document");
		await terminal.waitForRender();
		assert.equal(await tui.copyActiveSelectionToClipboard(), false);
		assert.deepEqual(copied, ["old document"]);
		assert.doesNotMatch(terminal.getViewport().join("\n"), /Shift\+Enter/);
		assert.match(terminal.getViewport().join("\n"), /unrelated overlay/);
		terminal.sendInput("editor draft");
		assert.deepEqual(inputs, ["editor draft"]);
		overlay.hide();
		terminal.sendInput("\x1b[102;6u");
		await terminal.waitForRender();
		assert.match(terminal.getViewport().join("\n"), /Find in transcript/);
	} finally {
		tui.stop({ preserveScreen: true });
	}
});
