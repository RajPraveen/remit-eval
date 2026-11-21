// One record in a run: its tags, Previous and Next through the run's records, boundary and trace eval,
// the documents the agent received (a click opens one in a side panel), and the agent's steps.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Breadcrumb, Button, Card, Col, Flex, Row, Spin, Tag } from 'antd';
import type { RecordDetail } from '../../../shared/types';
import { api } from '../shared/api';
import { label, StatusTag } from '../shared/format';
import BoundaryEvalCard from './BoundaryEvalCard';
import DocumentViewer from './DocumentViewer';
import StepsCard from './StepsCard';
import TraceEvalCard from './TraceEvalCard';
import { documentFiles, documentName, neighbours } from './utils';

export default function RecordPage() {
  const { id = '', recordId = '' } = useParams();
  const navigate = useNavigate();
  const [rec, setRec] = useState<RecordDetail | null>(null);
  const [recordIds, setRecordIds] = useState<string[]>([]);
  const [openFile, setOpenFile] = useState<string | null>(null);

  useEffect(() => {
    api.run(id).then((r) => setRecordIds(r.records.map((x) => x.record_id)), () => undefined);
  }, [id]);

  useEffect(() => {
    setRec(null);
    setOpenFile(null);
    api.record(id, recordId).then(setRec, () => undefined);
  }, [id, recordId]);

  // Showing the spinner also unmounts the cards, which resets their "Show N more" and selected step.
  if (!rec) return <Spin />;

  const documents = documentFiles(rec.record);
  const { position, previous, next } = neighbours(recordIds, rec.record.id);
  const go = (to: string) => navigate(`/runs/${rec.run_id}/records/${encodeURIComponent(to)}`);
  const breadcrumb = [
    { title: <Link to="/">Runs</Link> },
    { title: <Link to={`/runs/${rec.run_id}`}>Run {rec.run_id}</Link> },
    { title: rec.record.id },
  ];

  return (
    <Flex vertical gap={16}>
      <Flex gap={12} align="center" wrap>
        <Breadcrumb items={breadcrumb} />
        <span>
          <Tag>{rec.record.kind}</Tag>
          <Tag>Account {rec.record.account}</Tag>
          {rec.status === 'running' && <StatusTag label="Running" />}
          {rec.status === 'did_not_finish' && <StatusTag label="Did not finish" />}
          {rec.boundary && <StatusTag label={label(rec.boundary.verdict)} />}
          {rec.boundary && <StatusTag label={rec.boundary.flagged === 'yes' ? 'Flagged' : 'Not flagged'} />}
        </span>
        <Flex gap={8} align="center" style={{ marginLeft: 'auto' }}>
          {position >= 0 && (
            <span>
              {position + 1} of {recordIds.length}
            </span>
          )}
          <Button disabled={!previous} onClick={() => previous && go(previous)}>
            Previous
          </Button>
          <Button disabled={!next} onClick={() => next && go(next)}>
            Next
          </Button>
        </Flex>
      </Flex>
      {rec.error && <div>{rec.error}</div>}

      <Row gutter={16}>
        <Col span={12}>
          <Flex vertical gap={16}>
            <BoundaryEvalCard details={rec.boundary?.details ?? null} />
            <TraceEvalCard trace={rec.trace} />
          </Flex>
        </Col>
        <Col span={12}>
          <Flex vertical gap={16}>
            <Card title="Documents">
              <Flex vertical gap={4}>
                {documents.map((f) => (
                  <a key={f.name} onClick={() => setOpenFile(f.name)}>
                    {documentName(f.name)}
                  </a>
                ))}
              </Flex>
            </Card>
            <StepsCard steps={rec.steps} answer={rec.answer} />
          </Flex>
        </Col>
      </Row>
      <DocumentViewer recordId={rec.record.id} fileName={openFile} onClose={() => setOpenFile(null)} />
    </Flex>
  );
}
