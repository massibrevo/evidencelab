import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import NotebookStudio from "./NotebookStudio";
vi.mock("@uiw/react-codemirror", () => ({
  default: ({
    value,
    onChange,
    onFocus,
  }: {
    value: string;
    onChange: (value: string) => void;
    onFocus: () => void;
  }) => (
    <textarea
      aria-label="Python cell editor"
      value={value}
      onFocus={onFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
vi.mock("@codemirror/lang-python", () => ({ python: () => [] }));
let enabled = true;
let requests: {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}[] = [];
let book: any;
const makeBook = () => ({
  id: "lab-test",
  title: "Test investigation",
  description: "A test notebook",
  revision: "a".repeat(64),
  origin: "workspace",
  kernel_running: false,
  execution_enabled: enabled,
  notebook: {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { title: "Test investigation" },
    cells: [
      {
        id: "md",
        cell_type: "markdown",
        source: "# Test investigation\n\nAn explicit research question.",
        metadata: {},
      },
      {
        id: "code",
        cell_type: "code",
        source: "print(1)",
        metadata: {},
        outputs: [],
        execution_count: null,
      },
    ],
  },
});
beforeEach(() => {
  enabled = true;
  requests = [];
  book = makeBook();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      const method = options?.method ?? "GET";
      const body = options?.body ? JSON.parse(options.body as string) : null;
      requests.push({ url, method, body });
      let response: any;
      if (url === "/api/notebooks" && method === "GET")
        response = {
          notebooks: [{ ...book, cells: 2, code_cells: 1 }],
          execution_enabled: enabled,
          enable_command: "./scripts/dev.sh --notebooks",
          execution_notice:
            "Python runs locally only after an explicit request.",
        };
      else if (method === "PUT") {
        book = { ...book, notebook: body.notebook, revision: "b".repeat(64) };
        response = book;
      } else if (url.endsWith("/run")) {
        book = { ...book, revision: "c".repeat(64), kernel_running: true };
        book.notebook.cells[1].outputs = [
          { output_type: "stream", name: "stdout", text: "42\n" },
        ];
        book.notebook.cells[1].execution_count = 1;
        response = { ...book, status: "completed" };
      } else response = book;
      return { ok: true, json: async () => structuredClone(response) };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Integrated notebook workspace", () => {
  it("edits and saves a notebook without executing it", async () => {
    render(<NotebookStudio />);
    const editor = await screen.findByLabelText("Python cell editor");
    fireEvent.change(editor, { target: { value: "print(42)" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Notebook saved locally.");
    expect(
      requests.find((r) => r.method === "PUT")?.body?.notebook,
    ).toMatchObject({
      cells: expect.arrayContaining([
        expect.objectContaining({ source: "print(42)" }),
      ]),
    });
    expect(requests.some((r) => r.url.endsWith("/run"))).toBe(false);
  });
  it("runs only after the user presses Run and shows real returned stdout", async () => {
    render(<NotebookStudio />);
    await screen.findByLabelText("Python cell editor");
    expect(requests.some((r) => r.url.endsWith("/run"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Run cell 2" }));
    await screen.findByText("42", {});
    expect(requests.filter((r) => r.url.endsWith("/run"))).toHaveLength(1);
    expect(requests.find((r) => r.url.endsWith("/run"))?.body).toMatchObject({
      cell_id: "code",
      timeout: 30,
    });
  });
  it("keeps execution disabled until the operator enables the local kernel", async () => {
    enabled = false;
    book = makeBook();
    render(<NotebookStudio />);
    await screen.findByLabelText("Python cell editor");
    fireEvent.click(screen.getByRole("button", { name: "Run cell 2" }));
    await screen.findByRole("alert");
    expect(requests.some((r) => r.url.endsWith("/run"))).toBe(false);
  });
  it("can undo removal of a code cell", async () => {
    render(<NotebookStudio />);
    await screen.findByLabelText("Python cell editor");
    fireEvent.click(screen.getByRole("button", { name: "Delete cell 2" }));
    expect(
      screen.queryByLabelText("Python cell editor"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo delete" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Python cell editor")).toHaveValue(
        "print(1)",
      ),
    );
  });
});
