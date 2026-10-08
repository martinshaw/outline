import {
  AutoLinkPlugin,
  createLinkMatcherWithRegExp,
  type LinkMatcher,
} from '@lexical/react/LexicalAutoLinkPlugin';

/** Hostnames without a public TLD (e.g. https://localhost:5173/path) */
const LOCAL_URL_REGEX =
  /https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?(\/[^\s]*)?/i;

const URL_REGEX =
  /((https?:\/\/(www\.)?)|(www\.))[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/;

const EMAIL_REGEX =
  /(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))/;

const NEW_TAB = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const;

function withNewTab(matcher: LinkMatcher): LinkMatcher {
  return (text) => {
    const match = matcher(text);
    if (!match) return null;
    return {
      ...match,
      attributes: {
        ...match.attributes,
        ...NEW_TAB,
      },
    };
  };
}

const MATCHERS = [
  withNewTab(createLinkMatcherWithRegExp(LOCAL_URL_REGEX)),
  withNewTab(
    createLinkMatcherWithRegExp(URL_REGEX, (text) =>
      text.startsWith('http') ? text : `https://${text}`,
    ),
  ),
  withNewTab(
    createLinkMatcherWithRegExp(EMAIL_REGEX, (text) => `mailto:${text}`),
  ),
];

/** Turns typed URLs / emails into AutoLink nodes as you type. */
export function OutlineAutoLinkPlugin() {
  return <AutoLinkPlugin matchers={MATCHERS} />;
}
