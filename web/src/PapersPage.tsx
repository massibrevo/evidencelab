import { ArrowUpRight, FileText, Search } from "lucide-react";
import { lazy } from "react";

import { Empty, IconButton, Tag } from "./UI";
import type { Paper } from "./types";
const Plot = lazy(() => import("./Plot"));
export default function PapersPage({
  papers,
  paperSearch,
  setPaperSearch,
  openPaper,
}: {
  papers: Paper[];
  paperSearch: string;
  setPaperSearch: (value: string) => void;
  openPaper: (id: string) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>
          Document collection <Tag tone="gray">{papers.length}</Tag>
        </h2>
        <div className="search-field">
          <Search size={14} />
          <input
            placeholder="Filter by title or paper ID…"
            value={paperSearch}
            onChange={(e) => setPaperSearch(e.target.value)}
            aria-label="Filter papers"
          />
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>DOCUMENT</th>
              <th>SOURCE</th>
              <th>SIZE</th>
              <th>STATUS</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {papers
              .filter((p) =>
                (p.title + " " + p.id)
                  .toLowerCase()
                  .includes(paperSearch.toLowerCase()),
              )
              .map((p, i) => (
                <tr key={p.id} onClick={() => openPaper(p.id)}>
                  <td>
                    <div className="paper-cell">
                      <span className="document-icon">
                        <FileText size={18} />
                      </span>
                      <div>
                        <strong>{p.title}</strong>
                        <small>
                          #{p.id} · {p.license}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Tag tone="gray">{p.dataset}</Tag>
                  </td>
                  <td className="mono">
                    {(p.characters / 1000).toFixed(1)}k chars
                  </td>
                  <td>
                    <span className="inline-status">
                      <span className="live-dot" />
                      Indexed
                    </span>
                  </td>
                  <td>
                    <IconButton
                      label={`Read ${p.title}`}
                      onClick={() => openPaper(p.id)}
                    >
                      <ArrowUpRight size={15} />
                    </IconButton>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!papers.filter((p) =>
        (p.title + " " + p.id)
          .toLowerCase()
          .includes(paperSearch.toLowerCase()),
      ).length && (
        <Empty
          icon={Search}
          title="No matching papers"
          text="Try a broader title or import a new document."
        />
      )}
      <div className="table-footer">
        {papers.length} documents stored locally
        <span>Corpus: ODC-By-1.0 · Claims: CC-BY-4.0</span>
      </div>
    </section>
  );
}
