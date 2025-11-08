export interface ToolMetadataOverride {
  friendlyName?: string;
  description?: string;
}

export const TOOL_METADATA: Record<string, ToolMetadataOverride> = {
  'search.web': {
    friendlyName: 'Open Web Search',
    description: 'Search the public web via Google/SerpAPI and return the top snippets.',
  },
  'search.wikipedia': {
    friendlyName: 'Wikipedia Lookup',
    description: 'Look up Wikipedia articles and summarize the top matches.',
  },
  'search.arxiv': {
    friendlyName: 'arXiv Paper Search',
    description: 'Find academic papers on arXiv and summarize their abstracts.',
  },
  'query.dynamodb.nexusnote_before_i_forget_production': {
    friendlyName: 'Before I Forget Reminders',
    description: 'List reminder entries captured in the “Before I Forget” flow.',
  },
  'query.dynamodb.nexusnote_chat_conversations_production': {
    friendlyName: 'Chat Conversations',
    description: 'Inspect stored chat conversations and their metadata.',
  },
  'query.dynamodb.nexusnote_debate_sessions_production': {
    friendlyName: 'Debate Sessions',
    description: 'Retrieve debate sessions along with topic and status info.',
  },
  'query.dynamodb.nexusnote_debate_turns_production': {
    friendlyName: 'Debate Turns',
    description: 'Fetch individual turns within a debate session.',
  },
  'query.dynamodb.nexusnote_implementation_projects_production': {
    friendlyName: 'Implementation Projects',
    description: 'List implementation projects that are tracked per user.',
  },
  'query.dynamodb.nexusnote_inno_contacts_production': {
    friendlyName: 'Innovation Contacts',
    description: 'Review innovation contacts and their latest updates.',
  },
  'query.dynamodb.nexusnote_notes_production': {
    friendlyName: 'Notes',
    description: 'Query all captured notes for the current user.',
  },
  'query.dynamodb.nexusnote_personas_production': {
    friendlyName: 'AI Personas',
    description: 'Inspect configured AI personas and their settings.',
  },
  'query.dynamodb.nexusnote_shared_data_production': {
    friendlyName: 'Shared Mindmaps',
    description: 'Retrieve shared mindmaps and node data.',
  },
  'query.dynamodb.nexusnote_soliloquies_production': {
    friendlyName: 'Soliloquies',
    description: 'List soliloquy recordings associated with the user.',
  },
  'query.dynamodb.nexusnote_thought_tags_production': {
    friendlyName: 'Thought Tags',
    description: 'Summarize thought tags, usage counts, and timestamps.',
  },
  'query.dynamodb.nexusnote_thoughts_production': {
    friendlyName: 'Thoughts',
    description: 'Query thought entries captured by the user.',
  },
  'query.dynamodb.nexusnote_tracking_workboard_production': {
    friendlyName: 'Tracking Workboard',
    description: 'Inspect workboard slots, chains, and tasks.',
  },
  'query.dynamodb.ghostinfrastack_poststablec82b36f0_1oy982xqpej9x': {
    friendlyName: 'Ghost Posts',
    description: 'Query Ghost CMS posts stored in the DynamoDB posts table.',
  },
};
