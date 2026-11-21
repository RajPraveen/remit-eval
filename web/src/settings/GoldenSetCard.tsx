// The golden set: its version and each record with its files and expected row count.
import { useEffect, useState } from 'react';
import { Card, Descriptions, Table } from 'antd';
import type { GoldenRecord, GoldenSet } from '../../../shared/types';
import { api } from '../shared/api';
import { fileNames } from './utils';

const columns = [
  { title: 'Record', dataIndex: 'id', key: 'id' },
  { title: 'Kind', dataIndex: 'kind', key: 'kind' },
  { title: 'Account', dataIndex: 'account', key: 'account' },
  { title: 'Files', key: 'files', render: (_: unknown, r: GoldenRecord) => fileNames(r) },
  { title: 'Expected rows', dataIndex: 'expected_rows', key: 'expected_rows' },
];

function versionItems(golden: GoldenSet) {
  return [{ key: 'version', label: 'Version', children: golden.version }];
}

export default function GoldenSetCard() {
  const [golden, setGolden] = useState<GoldenSet | null>(null);

  useEffect(() => {
    api.golden().then(setGolden, () => undefined);
  }, []);

  return (
    <Card title="Golden set" loading={!golden}>
      {golden && (
        <>
          <Descriptions size="small" items={versionItems(golden)} />
          <Table size="small" pagination={false} rowKey="id" dataSource={golden.records} columns={columns} />
        </>
      )}
    </Card>
  );
}
