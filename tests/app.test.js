const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDefaultCustomGraphState,
  edgeStorageKey,
  sanitizeCustomGraphState
} = require('../public/app.js');

test('sanitizeCustomGraphState removes custom edges and notes for missing nodes', () => {
  const state = {
    ...createDefaultCustomGraphState(),
    nodeNotes: {
      '172.16.7.60': 'keep',
      '172.16.7.99': 'remove me'
    },
    edgeNotes: {
      [edgeStorageKey('172.16.7.60', '172.16.6.100')]: 'stale custom edge',
      [edgeStorageKey('172.16.7.60', '172.16.7.50')]: 'keep custom edge',
      [edgeStorageKey('INLANEFREIGHT', '172.16.7.60')]: 'keep base edge'
    },
    customEdges: [
      {
        id: 'custom:172.16.7.60->172.16.6.100',
        source: '172.16.7.60',
        target: '172.16.6.100'
      },
      {
        id: 'custom:172.16.7.60->172.16.7.50',
        source: '172.16.7.60',
        target: '172.16.7.50'
      }
    ]
  };

  const graph = {
    edges: [
      {
        data: {
          source: 'INLANEFREIGHT',
          target: '172.16.7.60'
        }
      }
    ]
  };

  const result = sanitizeCustomGraphState(
    new Set(['172.16.7.60', '172.16.7.50', 'INLANEFREIGHT']),
    state,
    graph,
    { sourceId: '172.16.6.100' }
  );

  assert.equal(result.customEdges.length, 1);
  assert.deepEqual(result.customState.customEdges, [
    {
      id: 'custom:172.16.7.60->172.16.7.50',
      source: '172.16.7.60',
      target: '172.16.7.50'
    }
  ]);
  assert.deepEqual(result.customState.nodeNotes, {
    '172.16.7.60': 'keep'
  });
  assert.deepEqual(result.customState.edgeNotes, {
    [edgeStorageKey('172.16.7.60', '172.16.7.50')]: 'keep custom edge',
    [edgeStorageKey('INLANEFREIGHT', '172.16.7.60')]: 'keep base edge'
  });
  assert.equal(result.connectionDraft, null);
  assert.equal(result.changed, true);
});
