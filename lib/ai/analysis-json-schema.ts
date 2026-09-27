export const ANALYSIS_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    version: { type: 'integer', enum: [1] },
    mode: { type: 'string', enum: ['summary', 'organize', 'analysis', 'question', 'action_items'] },
    title: { type: 'string' },
    overview: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string' },
          heading: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                sourceLabels: { type: 'array', items: { type: 'string' } },
              },
              required: ['text', 'sourceLabels'],
              additionalProperties: false,
            },
          },
        },
        required: ['kind', 'heading', 'items'],
        additionalProperties: false,
      },
    },
    unknowns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          sourceLabels: { type: 'array', items: { type: 'string' } },
        },
        required: ['text', 'sourceLabels'],
        additionalProperties: false,
      },
    },
  },
  required: ['version', 'mode', 'title', 'overview', 'sections', 'unknowns'],
  additionalProperties: false,
} as const
