// Settings: account instructions, the agent design, and the golden set, one card each.
import { Flex } from 'antd';
import AccountInstructionsCard from './AccountInstructionsCard';
import AgentDesignCard from './AgentDesignCard';
import GoldenSetCard from './GoldenSetCard';

export default function SettingsPage() {
  return (
    <Flex vertical gap={16}>
      <AccountInstructionsCard />
      <AgentDesignCard />
      <GoldenSetCard />
    </Flex>
  );
}
