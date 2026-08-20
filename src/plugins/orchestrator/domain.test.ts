import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createWorkflowDefinition, validateAcyclic } from './domain.ts'
import type { TaskNode, TaskEdge } from './domain.ts'

function node(id: string, agentId = 'agent-1', task = 'do something'): TaskNode {
  return { id, agentId, task }
}

function edge(from: string, to: string): TaskEdge {
  return { from, to }
}

describe('validateAcyclic', () => {
  test('should_pass_when_there_are_no_edges', () => {
    assert.doesNotThrow(() => validateAcyclic([node('a'), node('b')], []))
  })

  test('should_pass_when_edges_form_a_linear_chain', () => {
    const nodes = [node('a'), node('b'), node('c')]
    const edges = [edge('a', 'b'), edge('b', 'c')]
    assert.doesNotThrow(() => validateAcyclic(nodes, edges))
  })

  test('should_pass_when_edges_form_a_diamond_shape', () => {
    // a -> b -> d
    // a -> c -> d
    const nodes = [node('a'), node('b'), node('c'), node('d')]
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')]
    assert.doesNotThrow(() => validateAcyclic(nodes, edges))
  })

  test('should_throw_when_two_nodes_form_a_direct_cycle', () => {
    const nodes = [node('a'), node('b')]
    const edges = [edge('a', 'b'), edge('b', 'a')]
    assert.throws(() => validateAcyclic(nodes, edges))
  })

  test('should_throw_when_three_nodes_form_a_longer_cycle', () => {
    const nodes = [node('a'), node('b'), node('c')]
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')]
    assert.throws(() => validateAcyclic(nodes, edges))
  })

  test('should_throw_when_a_node_has_a_self_loop', () => {
    const nodes = [node('a')]
    const edges = [edge('a', 'a')]
    assert.throws(() => validateAcyclic(nodes, edges))
  })

  test('should_throw_when_edge_references_unknown_from_node', () => {
    const nodes = [node('a')]
    const edges = [edge('ghost', 'a')]
    assert.throws(() => validateAcyclic(nodes, edges))
  })

  test('should_throw_when_edge_references_unknown_to_node', () => {
    const nodes = [node('a')]
    const edges = [edge('a', 'ghost')]
    assert.throws(() => validateAcyclic(nodes, edges))
  })

  test('should_throw_when_node_ids_are_duplicated', () => {
    const nodes = [node('a'), node('a')]
    assert.throws(() => validateAcyclic(nodes, []))
  })
})

describe('createWorkflowDefinition', () => {
  test('should_create_workflow_when_all_fields_valid', () => {
    const wf = createWorkflowDefinition({
      id: 'wf-1',
      name: 'Build the app',
      roomId: 'room-1',
      nodes: [node('n1', 'agent-allen', 'write frontend'), node('n2', 'agent-ben', 'write backend')],
      edges: [],
    })
    assert.equal(wf.id, 'wf-1')
    assert.equal(wf.nodes.length, 2)
    assert.equal(wf.sandboxExecutor, null)
  })

  test('should_keep_explicit_sandboxExecutor_when_provided', () => {
    const wf = createWorkflowDefinition({
      id: 'wf-1',
      name: 'Build the app',
      roomId: 'room-1',
      nodes: [],
      edges: [],
      sandboxExecutor: 'seatbelt',
    })
    assert.equal(wf.sandboxExecutor, 'seatbelt')
  })

  test('should_throw_when_id_is_blank', () => {
    assert.throws(() => createWorkflowDefinition({ id: '', name: 'x', roomId: 'r1', nodes: [], edges: [] }))
  })

  test('should_throw_when_name_is_blank', () => {
    assert.throws(() => createWorkflowDefinition({ id: 'wf-1', name: '', roomId: 'r1', nodes: [], edges: [] }))
  })

  test('should_throw_when_roomId_is_blank', () => {
    assert.throws(() => createWorkflowDefinition({ id: 'wf-1', name: 'x', roomId: '', nodes: [], edges: [] }))
  })

  test('should_throw_when_a_node_has_blank_task', () => {
    assert.throws(() =>
      createWorkflowDefinition({
        id: 'wf-1',
        name: 'x',
        roomId: 'r1',
        nodes: [node('n1', 'agent-1', '')],
        edges: [],
      }),
    )
  })

  test('should_throw_when_nodes_form_a_cycle', () => {
    assert.throws(() =>
      createWorkflowDefinition({
        id: 'wf-1',
        name: 'x',
        roomId: 'r1',
        nodes: [node('n1'), node('n2')],
        edges: [edge('n1', 'n2'), edge('n2', 'n1')],
      }),
    )
  })
})
