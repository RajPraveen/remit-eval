// A JSON value as a tree that can be collapsed, expanded and copied.
import ReactJson from '@microlink/react-json-view';

export default function JsonViewer({ data }: { data: object }) {
  return (
    <ReactJson
      src={data}
      name={false}
      collapsed={false}
      displayDataTypes={false}
      displayObjectSize={false}
      enableClipboard
      collapseStringsAfterLength={300}
      style={{ fontSize: 13, wordBreak: 'break-word' }}
    />
  );
}
