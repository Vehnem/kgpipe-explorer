type LearnPageProps = {
  onNavigate: (page: "explorer" | "builder" | "results" | "leaderboard") => void;
};

const conceptCards = [
  {
    title: "What is a knowledge graph?",
    body:
      "A knowledge graph stores things and their relationships. Instead of one table with fixed columns, it connects entities such as tasks, formats, tools, metrics, and runs.",
    example: "NERExtractor -> produces -> RDF triples"
  },
  {
    title: "Triples: subject, predicate, object",
    body:
      "Most KG facts can be read as short statements. The subject is the thing, the predicate is the relationship, and the object is the target or value.",
    example: "PDFtoMarkdown -> outputs -> Markdown"
  },
  {
    title: "Why RDF?",
    body:
      "RDF is a standard way to represent graph facts as triples. URIs identify things globally, while labels make those things easier for people to read.",
    example: "Task URI + label + input/output formats"
  },
  {
    title: "What is SPARQL?",
    body:
      "SPARQL is the query language for RDF graphs. It searches for graph patterns, which is useful when the question is about relationships rather than rows.",
    example: "Find all tasks that produce Turtle output"
  },
  {
    title: "Pipeline thinking",
    body:
      "A pipeline is a directed flow of data. Each step consumes something and produces something. Format compatibility keeps the flow executable.",
    example: "Text -> NER -> RDF -> KG linker -> final KG"
  },
  {
    title: "Metrics and rankings",
    body:
      "Metrics summarize evidence about a pipeline run. A leaderboard then turns many metrics into one ranking, based on grouping, aggregation, and weights.",
    example: "Coverage + accuracy + consistency -> final score"
  }
];

const workflowCards: Array<{
  title: string;
  body: string;
  action: string;
  page: "explorer" | "builder" | "results" | "leaderboard";
}> = [
  {
    title: "Sketch a pipeline",
    body: "Use the Pipeline Editor to connect data sources, processing tasks, and target outputs as a DAG-style workflow.",
    action: "Open Pipeline Editor",
    page: "builder"
  },
  {
    title: "Compare outputs",
    body: "Use Pipeline Results to compare metric values and artifacts produced by different pipeline runs.",
    action: "Open Pipeline Results",
    page: "results"
  },
  {
    title: "Reason about rankings",
    body: "Use the Leaderboard to explore how metric groups, aggregators, and weights influence pipeline order.",
    action: "Open Leaderboard",
    page: "leaderboard"
  }
];

const references: Array<{ kind: string; title: string; href: string }> = [
  {
    kind: "GitHub",
    title: "Demo",
    href: "https://github.com/Vehnem/kgpipe-explorer"
  },
  {
    kind: "GitHub",
    title: "KGpipe",
    href: "https://github.com/ScaDS/KGpipe"
  },
  {
    kind: "Paper",
    title: "Framework Paper",
    href: "https://arxiv.org/abs/2511.18364"
  },
  {
    kind: "Paper",
    title: "Benchmark Paper",
    href: "https://arxiv.org/abs/2605.22304"
  }
];

export function LearnPage({ onNavigate }: LearnPageProps) {
  return (
    <section className="page-scaffold learn-page">
      <section className="learn-workflow" data-tutorial="learn-workflow">
        <header className="page-header learn-hero">
          <p className="learn-eyebrow">Welcome</p>
          <h2>Get started with KGpipe Explorer</h2>
          <p>
            This workspace helps you inspect knowledge-graph metadata, design
            pipelines, compare run outputs, and reason about rankings. Follow the
            suggested workflow below, then dig into the concepts when you want more
            background.
          </p>
        </header>

        <div className="learn-section-heading">
          <p className="learn-eyebrow">From concept to app</p>
          <h3>Suggested workflow</h3>
        </div>
        <div className="learn-workflow-grid">
          {workflowCards.map((card, index) => (
            <article key={card.title} className="learn-workflow-card">
              <span className="learn-step-index">{index + 1}</span>
              <h4>{card.title}</h4>
              <p>{card.body}</p>
              <button type="button" onClick={() => onNavigate(card.page)}>
                {card.action}
              </button>
            </article>
          ))}
        </div>

        <div className="learn-section-heading">
          <p className="learn-eyebrow">Under the hood</p>
          <h3>Debug / inspect metadata</h3>
        </div>
        <article className="learn-inspect-card">
          <div>
            <h4>Metadata Explorer</h4>
            <p>
              See how tasks, implementations, metrics, and runs connect inside the
              KGpipe graph when you need to debug or inspect the underlying
              metadata.
            </p>
          </div>
          <button type="button" onClick={() => onNavigate("explorer")}>
            Open Metadata Explorer
          </button>
        </article>

        <div className="learn-section-heading">
          <p className="learn-eyebrow">Source material</p>
          <h3>References</h3>
        </div>
        <ul className="learn-references">
          {references.map((ref) => (
            <li key={ref.href}>
              <span className="learn-reference-kind">{ref.kind}</span>
              <a href={ref.href} target="_blank" rel="noreferrer">
                {ref.title}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <div className="learn-basics-block" data-tutorial="learn-basics">
        <div className="learn-section-heading">
          <p className="learn-eyebrow">Knowledge Graph Primer</p>
          <h3>Core concepts</h3>
          <p>
            Enough context to make the explorer useful: knowledge graphs, triples,
            RDF, SPARQL, pipelines, metrics, and rankings.
          </p>
        </div>

        <div className="learn-concept-grid">
          {conceptCards.map((card) => (
            <article key={card.title} className="learn-card">
              <h3>{card.title}</h3>
              <p>{card.body}</p>
              <code>{card.example}</code>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
