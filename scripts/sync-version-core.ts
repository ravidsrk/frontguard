export type RequiredEdit = {
  find: RegExp;
  replace: string;
  label: string;
  expected: number;
};

export function applyRequiredEdits(
  file: string,
  source: string,
  edits: RequiredEdit[],
): string {
  return edits.reduce((current, edit) => {
    const flags = edit.find.flags.includes("g")
      ? edit.find.flags
      : `${edit.find.flags}g`;
    const matches = [...current.matchAll(new RegExp(edit.find.source, flags))];
    if (matches.length !== edit.expected) {
      throw new Error(
        `${file}: ${edit.label} matched ${matches.length} time(s); expected ${edit.expected}`,
      );
    }
    return current.replace(edit.find, edit.replace);
  }, source);
}
