// Parses recognition.md into the structure both renderers and the lint read. One parser, so a
// lint arm can never disagree with the assembler about what a "section body" is.

export function parseRecognition(source) {
  const lines = source.split('\n');
  const doc = { title: null, preamble: [], sections: [] };
  let current = null;

  for (const line of lines) {
    const h1 = /^# (.+)$/.exec(line);
    const h3 = /^### (.+)$/.exec(line);

    if (h1) {
      doc.title = h1[1].trim();
      continue;
    }
    if (h3) {
      current = { heading: h3[1].trim(), lines: [] };
      doc.sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
    else if (doc.title !== null) doc.preamble.push(line);
  }

  doc.preambleText = blockText(doc.preamble);
  for (const section of doc.sections) section.body = blockText(section.lines);
  return doc;
}

function blockText(lines) {
  return lines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
}

// The first paragraph of the preamble. §6: the wrapper's description is generated from this,
// never hand-written, because the description is what a host matches against and is the closest
// thing in the feature to platform-authored behavior.
export function firstParagraph(source) {
  const doc = parseRecognition(source);
  const [para] = doc.preambleText.split(/\n\s*\n/);
  return (para ?? '').split('\n').map((l) => l.trim()).join(' ').trim();
}

// Sentence splitting is deliberately shallow: a period/question/exclamation followed by
// whitespace and a capital or quote. `recognition.md` is prose written to be read by an agent,
// not a corpus, and a heavier splitter would be a dependency the lint does not need.
export function splitSentences(text) {
  const flat = text.split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
  if (!flat) return [];
  return flat
    .split(/(?<=[.!?])\s+(?=["'“(]?[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}
