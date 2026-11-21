// One document of the record, opened in a panel over the page so the record stays in view behind it.
import { useEffect, useState } from 'react';
import { Drawer, Spin, Table } from 'antd';
import { fileUrl } from '../shared/api';
import { csvRows, documentName, viewerKind } from './utils';

interface Props {
  recordId: string;
  fileName: string | null; // null: closed
  onClose: () => void;
}

export default function DocumentViewer({ recordId, fileName, onClose }: Props) {
  const [text, setText] = useState<string | null>(null);
  const url = fileName ? fileUrl(recordId, fileName) : '';
  const kind = fileName ? viewerKind(fileName) : null;
  const isText = kind === 'text' || kind === 'table';

  useEffect(() => {
    setText(null);
    if (!isText) return;
    fetch(url).then((res) => res.text()).then(setText, () => setText(''));
  }, [url, isText]);

  const openInTab = (
    <a href={url} target="_blank" rel="noreferrer">
      Open in a new tab
    </a>
  );

  return (
    <Drawer
      title={fileName ? documentName(fileName) : ''}
      open={fileName !== null}
      onClose={onClose}
      size="large"
      extra={openInTab}
      styles={{ body: { padding: kind === 'pdf' ? 0 : 16 } }}
    >
      {kind === 'pdf' && <iframe title={fileName ?? ''} src={url} style={{ width: '100%', height: '100%', border: 0 }} />}
      {kind === 'image' && <img alt={fileName ?? ''} src={url} style={{ maxWidth: '100%' }} />}
      {isText && text === null && <Spin />}
      {kind === 'text' && text !== null && (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13 }}>{text}</pre>
      )}
      {kind === 'table' && text !== null && <CsvTable text={text} />}
      {kind === 'other' && openInTab}
    </Drawer>
  );
}

function CsvTable({ text }: { text: string }) {
  const [header, ...rows] = csvRows(text);
  const columns = (header ?? []).map((title, i) => ({ title, dataIndex: String(i), key: String(i) }));
  const data = rows.map((cells, r) => ({ key: r, ...Object.fromEntries(cells.map((c, i) => [String(i), c])) }));
  return <Table size="small" pagination={false} columns={columns} dataSource={data} scroll={{ x: true }} />;
}
