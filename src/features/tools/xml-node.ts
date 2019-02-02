export interface XmlNode {
  name: string;
  prefix: string | undefined;
  local: string;
  uri: string | undefined;
  isSelfClosing: boolean;
  parent: XmlNode | undefined;
  children: (XmlNode | string)[];
  attributes: { [key: string]: string };
}
