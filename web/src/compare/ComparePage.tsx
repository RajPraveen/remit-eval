// A run compared with its baseline: the gate, settings that differed, eval totals, and records that changed.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, Col, Flex, Row, Spin, Table, Tag, Typography } from 'antd';
import type { ChangedRecord, Comparison, VersionDiff } from '../../../shared/types';
import { api } from '../shared/api';
import { formatValue, label, StatusTag } from '../shared/format';
import { boundaryRows, traceRows } from './utils';

export default function ComparePage() {
  const [params] = useSearchParams();
  const base = params.get('base') ?? '';
  const run = params.get('run') ?? '';
  const [cmp, setCmp] = useState<Comparison | null>(null);

  useEffect(() => {
    setCmp(null);
    api.compare(base, run).then(setCmp, () => undefined);
  }, [base, run]);

  if (!cmp) return <Spin />;

  const runTitle = `Run ${cmp.run.id}`;
  const baseTitle = `Run ${cmp.base.id}`;
  const sideColumns = [
    { title: 'Value', dataIndex: 'value', key: 'value' },
    { title: baseTitle, dataIndex: 'base', key: 'base' },
    { title: runTitle, dataIndex: 'run', key: 'run' },
  ];
  const differedColumns = [
    { title: 'Setting', dataIndex: 'path', key: 'path' },
    { title: baseTitle, key: 'before', render: (_: unknown, d: VersionDiff) => formatValue(d.before) },
    { title: runTitle, key: 'after', render: (_: unknown, d: VersionDiff) => formatValue(d.after) },
  ];
  const changedColumns = [
    {
      title: 'Record',
      key: 'record',
      render: (_: unknown, r: ChangedRecord) => (
        <Link to={`/runs/${cmp.run.id}/records/${encodeURIComponent(r.record_id)}`}>{r.record_id}</Link>
      ),
    },
    { title: 'Kind', dataIndex: 'kind', key: 'kind' },
    { title: 'What', dataIndex: 'what', key: 'what' },
    { title: baseTitle, dataIndex: 'base', key: 'base' },
    {
      title: runTitle,
      key: 'run',
      render: (_: unknown, r: ChangedRecord) => <Tag color={r.worse ? 'red' : 'green'}>{r.run}</Tag>,
    },
  ];

  return (
    <Flex vertical gap={16}>
      <Flex gap={12} align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Run {cmp.run.id} compared with run {cmp.base.id}
        </Typography.Title>
        <StatusTag label={label(cmp.gate)} />
      </Flex>

      <Card title="What differed">
        <Table
          size="small"
          pagination={false}
          rowKey="path"
          dataSource={cmp.differed}
          locale={{ emptyText: 'None' }}
          columns={differedColumns}
        />
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="Boundary eval" style={{ height: '100%' }}>
            <Table
              size="small"
              pagination={false}
              columns={sideColumns}
              dataSource={boundaryRows(cmp.boundary.base, cmp.boundary.run)}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Trace eval" style={{ height: '100%' }}>
            <Table
              size="small"
              pagination={false}
              columns={sideColumns}
              dataSource={traceRows(cmp.trace.base, cmp.trace.run)}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Records that changed">
        <Table
          size="small"
          pagination={false}
          rowKey={(r: ChangedRecord) => `${r.record_id}|${r.what}`}
          dataSource={cmp.changed_records}
          locale={{ emptyText: 'None' }}
          columns={changedColumns}
        />
      </Card>
    </Flex>
  );
}
