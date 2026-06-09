'use client';

import { Highlight, themes } from 'prism-react-renderer';

interface Props {
  code: string;
  language?: string;
}

export default function CodeBlock({ code, language = 'python' }: Props) {
  return (
    <Highlight theme={themes.nightOwl} code={code.trim()} language={language}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={`${className} rounded-lg p-4 overflow-x-auto text-sm`} style={style}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}