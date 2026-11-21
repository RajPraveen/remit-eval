// The agent design: model and tools for the orchestrator and the reader, and their core prompts.
import { useEffect, useState } from 'react';
import { Button, Card, Checkbox, Collapse, Flex, Form, Select } from 'antd';
import type { AgentDesign, DesignView } from '../../../shared/types';
import { api } from '../shared/api';
import { modelOptions } from './utils';

function Prompt({ text }: { text: string }) {
  return <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{text}</pre>;
}

export default function AgentDesignCard() {
  const [view, setView] = useState<DesignView | null>(null);
  const [orchestrator, setOrchestrator] = useState<AgentDesign | null>(null);
  const [reader, setReader] = useState<AgentDesign | null>(null);

  const show = (v: DesignView) => {
    setView(v);
    setOrchestrator(v.design.orchestrator);
    setReader(v.design.reader);
  };

  useEffect(() => {
    api.design().then(show, () => undefined);
  }, []);

  if (!view || !orchestrator || !reader) return <Card title="Agent design" loading />;

  const models = modelOptions(view.models);
  const save = () => api.saveDesign({ orchestrator, reader }).then(show, () => undefined);
  const readSection = reader.tools.includes('read_section');
  const prompts = [
    { key: 'orchestrator', label: 'orchestrator.md', children: <Prompt text={view.core.orchestrator} /> },
    { key: 'reader', label: 'reader.md', children: <Prompt text={view.core.reader} /> },
  ];

  return (
    <Card title="Agent design">
      <Form layout="vertical">
        <Flex gap={32}>
          <div>
            <h4>Orchestrator</h4>
            <Form.Item label="Model">
              <Select
                style={{ width: 240 }}
                value={orchestrator.model}
                onChange={(model) => setOrchestrator({ ...orchestrator, model })}
                options={models}
              />
            </Form.Item>
            <Form.Item label="Tools">
              <Checkbox checked disabled>
                read_part
              </Checkbox>
            </Form.Item>
          </div>
          <div>
            <h4>Reader</h4>
            <Form.Item label="Model">
              <Select
                style={{ width: 240 }}
                value={reader.model}
                onChange={(model) => setReader({ ...reader, model })}
                options={models}
              />
            </Form.Item>
            <Form.Item label="Tools">
              <Checkbox
                checked={readSection}
                onChange={(e) => setReader({ ...reader, tools: e.target.checked ? ['read_section'] : [] })}
              >
                read_section
              </Checkbox>
            </Form.Item>
          </div>
        </Flex>
      </Form>
      <Button type="primary" onClick={save} style={{ marginBottom: 16 }}>
        Save design
      </Button>
      <Collapse items={prompts} />
    </Card>
  );
}
