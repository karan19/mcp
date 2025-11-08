export interface ToolMetadataOverride {
  friendlyName?: string;
  description?: string;
}

export const TOOL_METADATA: Record<string, ToolMetadataOverride> = {
  'search.web': {
    friendlyName: 'Open Web Search',
    description: 'Use this when the user asks to search the public web (Google/SerpAPI) for up-to-date info.',
  },
  'search.wikipedia': {
    friendlyName: 'Wikipedia Lookup',
    description: 'Use this when the user wants background info that can be satisfied with Wikipedia summaries.',
  },
  'search.arxiv': {
    friendlyName: 'arXiv Paper Search',
    description: 'Use this whenever the user asks for academic or research papers from arXiv.',
  },
  'query.dynamodb.nexusnote_before_i_forget_production': {
    friendlyName: 'Before I Forget Reminders',
    description: 'Call this when the user wants to list, read, or search their “Before I Forget” reminders.',
  },
  'query.dynamodb.nexusnote_chat_conversations_production': {
    friendlyName: 'Chat Conversations',
    description: 'Use when the user requests a list or details of their chat conversations.',
  },
  'query.dynamodb.nexusnote_debate_sessions_production': {
    friendlyName: 'Debate Sessions',
    description: 'Use when the user asks about debate sessions, topics, or statuses.',
  },
  'query.dynamodb.nexusnote_debate_turns_production': {
    friendlyName: 'Debate Turns',
    description: 'Use when the user wants the individual turns for a debate session.',
  },
  'query.dynamodb.nexusnote_implementation_projects_production': {
    friendlyName: 'Implementation Projects',
    description: 'Use when the user asks to list or review their implementation projects.',
  },
  'query.dynamodb.nexusnote_inno_contacts_production': {
    friendlyName: 'Innovation Contacts',
    description: 'Use when the user wants to review their innovation contacts or their latest updates.',
  },
  'query.dynamodb.nexusnote_notes_production': {
    friendlyName: 'Notes',
    description: 'Use whenever the user says “my notes”, “all notes”, “list my notes”, or similar.',
  },
  'query.dynamodb.nexusnote_personas_production': {
    friendlyName: 'AI Personas',
    description: 'Use when the user wants to list or inspect their configured AI personas.',
  },
  'query.dynamodb.nexusnote_shared_data_production': {
    friendlyName: 'Shared Mindmaps',
    description: 'Use when the user requests mindmaps or shared node data.',
  },
  'query.dynamodb.nexusnote_soliloquies_production': {
    friendlyName: 'Soliloquies',
    description: 'Use when the user mentions their soliloquies or personal recordings.',
  },
  'query.dynamodb.nexusnote_thought_tags_production': {
    friendlyName: 'Thought Tags',
    description: 'Use when the user wants counts or metadata about their thought tags.',
  },
  'query.dynamodb.nexusnote_thoughts_production': {
    friendlyName: 'Thoughts',
    description: 'Use when the user asks for their thought entries (“list my thoughts”, “show thoughts”, etc.).',
  },
  'query.dynamodb.nexusnote_tracking_workboard_production': {
    friendlyName: 'Tracking Workboard',
    description: 'Use when the user wants workboard slots, chains, or tasks.',
  },
  'query.dynamodb.ghostinfrastack_poststablec82b36f0_1oy982xqpej9x': {
    friendlyName: 'Ghost Posts',
    description: 'Use when the user wants to look up Ghost CMS posts or render post content.',
  },
};
