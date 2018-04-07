export interface XliffDocument {
  xliff: XliffRootNode;
}

export interface XliffRootNode {
  $: {
    version: string;
    xmlns: string;
  };

  file: XliffFileNode[];
}

export interface XliffFileNode {
  $: {
    'source-language': string;
    datatype: string;
    original: string;
  };

  body: XliffBodyNode[];
}

export interface XliffBodyNode {
  'trans-unit': XliffTranslationUnitNode[];
}

export interface XliffTranslationUnitNode {
  $: {
    id: string;
    datatype: string;
  };

  source: string[];
  target: string[];
  'context-group': XliffContextGroupNode[];
  note: XliffNoteNode[];
}

export interface XliffContextGroupNode {
  $: {
    purpose: string;
  };

  context: XliffContextNode[];
}

export interface XliffContextNode {
  $: {
    'context-type': string;
  };
  _: string;
}

export interface XliffNoteNode {
  $: {
    priority: string;
    from: string;
  };
  _: string;
}
