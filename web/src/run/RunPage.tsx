// One run: its facts and version, boundary eval and trace eval totals, and the result for each record.
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Breadcrumb, Button, Card, Col, Descriptions, Flex, Row, Spin, Table } from 'antd';
import JsonViewer from '../shared/JsonViewer';
import type { RunDetail, RunRecordRow } from '../../../shared/types';
import { api } from '../shared/api';
import {
  formatChecks,
  formatScope,
  formatTally,
  formatText,
  formatTime,
  label,
  RunGateTags,
  StatusTag,
} from '../shared/format';
import { usePoll } from '../shared/usePoll';
import { boundaryItems, traceRows } from './utils';

const traceColumns = [
  { title: 'Check', dataIndex: 'check', key: 'check' },
  { title: 'Orchestrator', dataIndex: 'orchestrator', key: 'orchestrator' },
  { title: 'Reader', dataIndex: 'reader', key: 'reader' },
];

function recordTag(r: RunRecordRow) {
  if (r.status === 'running') return <StatusTag label="Running" />;
  return r.verdict ? <StatusTag label={label(r.verdict)} /> : 'none';
}

function recordColumns(runId: number) {
  return [
    {
      title: 'Record',
      key: 'record',
      render: (_: unknown, r: RunRecordRow) => (
        <Link to={`/runs/${runId}/records/${encodeURIComponent(r.record_id)}`}>{r.record_id}</Link>
      ),
    },
    { title: 'Kind', dataIndex: 'kind', key: 'kind' },
    { title: 'Account', dataIndex: 'account', key: 'account' },
    { title: 'Boundary', key: 'boundary', render: (_: unknown, r: RunRecordRow) => recordTag(r) },
    {
      title: 'Orchestrator checks',
      key: 'orch',
      render: (_: unknown, r: RunRecordRow) => formatChecks(r.orchestrator),
    },
    {
      title: 'Reader checks',
      key: 'reader',
      render: (_: unknown, r: RunRecordRow) => formatChecks(r.reader),
    },
    { title: 'Model calls', dataIndex: 'model_calls', key: 'calls' },
  ];
}

function runFacts(run: RunDetail) {
  const comparedTo =
    run.compared_to === null ? 'none' : <Link to={`/runs/${run.compared_to}`}>Run {run.compared_to}</Link>;
  return [
    { key: 'started', label: 'Started', children: formatTime(run.started_at) },
    { key: 'finished', label: 'Finished', children: formatTime(run.finished_at) },
    { key: 'scope', label: 'Scope', children: formatScope(run.scope) },
    { key: 'by', label: 'By', children: label(run.started_by) },
    { key: 'status', label: 'Status', children: label(run.status) },
    { key: 'progress', label: 'Records done', children: formatTally(run.progress) },
    { key: 'compared', label: 'Compared to', children: comparedTo },
    { key: 'note', label: 'Note', children: formatText(run.note) },
    ...(run.error ? [{ key: 'error', label: 'Error', children: run.error, span: 2 }] : []),
  ];
}

export default function RunPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: run } = usePoll(() => api.run(id), (r: RunDetail) => r.status === 'running', [id]);

  if (!run) return <Spin />;

  const compareWithBaseline = () => navigate(`/compare?base=${run.compared_to}&run=${run.id}`);

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center">
        <Flex gap={12} align="center">
          <Breadcrumb items={[{ title: <Link to="/">Runs</Link> }, { title: `Run ${run.id}` }]} />
          <span>
            <RunGateTags run={run} />
          </span>
        </Flex>
        {run.compared_to !== null && (
          <Button onClick={compareWithBaseline}>Compare with run {run.compared_to}</Button>
        )}
      </Flex>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="Run facts" style={{ height: '100%' }}>
            <Descriptions column={2} size="small" items={runFacts(run)} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Version" style={{ height: '100%' }}>
            <JsonViewer data={run.version} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="Boundary eval" style={{ height: '100%' }}>
            <Descriptions column={1} size="small" items={boundaryItems(run.boundary)} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Trace eval" style={{ height: '100%' }}>
            <Table size="small" pagination={false} dataSource={traceRows(run.trace)} columns={traceColumns} />
          </Card>
        </Col>
      </Row>

      <Card title="Records">
        <Table
          rowKey="record_id"
          size="small"
          pagination={false}
          dataSource={run.records}
          columns={recordColumns(run.id)}
        />
      </Card>
    </Flex>
  );
}
