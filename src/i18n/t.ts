import type en from "./dictionaries/en.json";

export type Messages = typeof en;

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every dictionary key as a dotted path, e.g. "home.heading". */
export type MessageKey = Leaves<Messages>;

/** Replaces {name} placeholders with the given values. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export function createT(messages: Messages) {
  return (key: MessageKey, values?: Record<string, string | number>): string => {
    const template = key
      .split(".")
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages) as string;
    return values ? fill(template, values) : template;
  };
}
