import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Case,
  UserOfficer,
  GraphNode,
  GraphEdge,
  TimelineEvent,
  PatternAlert,
  NetworkAnalytics,
  ExtractionCandidate,
  EntityMatchCandidate,
  DocumentStatus,
  AssistantMessage,
  EntityType,
  EvidenceChunk
} from '../types';
import { apiService, isMockApiEnabled, setMockApiMode } from '../services/api';
import { CURRENT_OFFICER } from '../services/mockData';

interface GraphFilters {
  entityTypes: EntityType[];
  minConfidence: number;
  searchTerm: string;
  selectedCaseOnly: boolean;
}

interface TimelineFilters {
  eventTypes: string[];
  entityId?: string;
  dateRange?: { start: string; end: string };
}

interface InvestigationContextType {
  // Officer
  currentUser: UserOfficer;
  isMockMode: boolean;
  toggleMockMode: (enabled: boolean) => void;

  // Case
  cases: Case[];
  selectedCase: Case | null;
  selectCase: (caseId: string) => Promise<void>;
  reloadCases: () => Promise<void>;

  // Graph state (Section 5, 6, 15)
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  selectedNode: GraphNode | null;
  selectedEdge: GraphEdge | null;
  expandedNodeIds: Set<string>;
  highlightedNodeIds: Set<string>;
  focusNodeId: string | null;
  graphFilters: GraphFilters;
  setGraphFilters: React.Dispatch<React.SetStateAction<GraphFilters>>;
  
  // Graph actions
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  expandNode: (nodeId: string) => Promise<void>;
  centerFocusOnNode: (nodeId: string) => void;
  resetGraphToCase: () => void;
  setHighlightedNodes: (nodeIds: string[]) => void;

  // Timeline
  timelineEvents: TimelineEvent[];
  timelineFilters: TimelineFilters;
  setTimelineFilters: React.Dispatch<React.SetStateAction<TimelineFilters>>;
  selectTimelineEvent: (event: TimelineEvent) => void;

  // Patterns & Analytics
  patterns: PatternAlert[];
  analytics: NetworkAnalytics | null;

  // Documents & Processing Status
  documents: DocumentStatus[];
  reloadDocuments: () => Promise<void>;
  uploadDocument: (file: File, caseIdOverride?: string) => Promise<void>;

  // Extraction Review
  extractions: ExtractionCandidate[];
  handleExtractionAction: (
    candidateId: string,
    action: 'APPROVE' | 'REJECT' | 'EDIT',
    params?: { editedValue?: string; rejectionReason?: string; reviewerNotes?: string }
  ) => Promise<void>;

  // Match Review
  matches: EntityMatchCandidate[];
  handleMatchDecision: (matchId: string, decision: 'CONFIRM' | 'REJECT') => Promise<void>;

  // Grounded AI Assistant
  assistantMessages: AssistantMessage[];
  isAiResponding: boolean;
  askAssistant: (query: string) => Promise<void>;
  executeAiAction: (action: { type: string; payload: any }) => void;

  // Active Context Tab for Right Panel
  activeContextTab: 'INSPECTOR' | 'PATTERNS' | 'ANALYTICS' | 'TIMELINE' | 'AI_ASSISTANT';
  setActiveContextTab: (tab: 'INSPECTOR' | 'PATTERNS' | 'ANALYTICS' | 'TIMELINE' | 'AI_ASSISTANT') => void;

  // Loading & Error states
  isLoading: boolean;
  error: string | null;
}

const InvestigationContext = createContext<InvestigationContextType | undefined>(undefined);

const ALL_ENTITY_TYPES: EntityType[] = [
  'CASE',
  'PERSON',
  'PHONE',
  'BANK_ACCOUNT',
  'LOCATION',
  'VEHICLE',
  'ORGANIZATION',
  'DEVICE_IMEI',
  'IP_ADDRESS',
  'CRYPTO_WALLET'
];

export const InvestigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser] = useState<UserOfficer>(CURRENT_OFFICER);
  const [isMockMode, setIsMockModeState] = useState<boolean>(isMockApiEnabled);

  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);

  // Graph state
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set(['node-case-284']));
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);

  // Filters
  const [graphFilters, setGraphFilters] = useState<GraphFilters>({
    entityTypes: [...ALL_ENTITY_TYPES],
    minConfidence: 0.0,
    searchTerm: '',
    selectedCaseOnly: false
  });

  // Timeline & Patterns & Analytics
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [timelineFilters, setTimelineFilters] = useState<TimelineFilters>({
    eventTypes: ['FINANCIAL', 'COMMUNICATION', 'MOVEMENT', 'LEGAL', 'DIGITAL_TRACE']
  });
  const [patterns, setPatterns] = useState<PatternAlert[]>([]);
  const [analytics, setAnalytics] = useState<NetworkAnalytics | null>(null);

  // Documents & Reviews
  const [documents, setDocuments] = useState<DocumentStatus[]>([]);
  const [extractions, setExtractions] = useState<ExtractionCandidate[]>([]);
  const [matches, setMatches] = useState<EntityMatchCandidate[]>([]);

  // AI Assistant
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([
    {
      id: 'welcome-01',
      sender: 'assistant',
      timestamp: '10:00 AM',
      content: 'CyberSaarthi Grounded AI Assistant initialized. I operate exclusively on verified and ingested evidence records from Module 1 repositories.\n\nYou can query entity relationships, financial trails, CDR triangulations, or ask for cross-case corroborations.',
      queryClassification: 'SUMMARY'
    }
  ]);
  const [isAiResponding, setIsAiResponding] = useState(false);

  // Right Context Panel tab
  const [activeContextTab, setActiveContextTab] = useState<'INSPECTOR' | 'PATTERNS' | 'ANALYTICS' | 'TIMELINE' | 'AI_ASSISTANT'>('INSPECTOR');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const toggleMockMode = async (enabled: boolean) => {
    setMockApiMode(enabled);
    setIsMockModeState(enabled);
    setSelectedCase(null);
    try {
      setIsLoading(true);
      const fetched = await apiService.getCases();
      setCases(fetched);
      if (fetched.length > 0) {
        await loadCaseData(fetched[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to switch data source mode');
    } finally {
      setIsLoading(false);
    }
  };


  const loadCaseData = useCallback(async (caseId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const [c, graph, docs, exts, mtchs, tline, pats, anlyt] = await Promise.all([
        apiService.getCaseById(caseId),
        apiService.getCaseGraph(caseId),
        apiService.getCaseDocuments(caseId),
        apiService.getExtractions(caseId),
        apiService.getEntityMatches(caseId),
        apiService.getTimeline(caseId),
        apiService.getPatterns(caseId),
        apiService.getAnalytics(caseId)
      ]);

      if (c) setSelectedCase(c);
      setGraphNodes(graph.nodes);
      setGraphEdges(graph.edges);
      setDocuments(docs);
      setExtractions(exts);
      setMatches(mtchs);
      setTimelineEvents(tline);
      setPatterns(pats);
      setAnalytics(anlyt);

      // Default select case root node
      const rootNode = graph.nodes.find(n => n.isRoot) || graph.nodes[0] || null;
      setSelectedNode(rootNode);
      setSelectedEdge(null);
      setFocusNodeId(rootNode ? rootNode.id : null);
      setExpandedNodeIds(new Set(rootNode ? [rootNode.id] : []));
      setHighlightedNodeIds(new Set());
    } catch (err: any) {
      setError(err.message || 'Failed to load case investigation data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reloadCases = useCallback(async () => {
    try {
      setIsLoading(true);
      const fetched = await apiService.getCases();
      setCases(fetched);
      if (fetched.length > 0 && !selectedCase) {
        await loadCaseData(fetched[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load cases');
    } finally {
      setIsLoading(false);
    }
  }, [selectedCase, loadCaseData]);

  useEffect(() => {
    reloadCases();
  }, [reloadCases]);

  const selectCase = async (caseId: string) => {
    await loadCaseData(caseId);
  };

  const reloadDocuments = async () => {
    if (!selectedCase) return;
    const docs = await apiService.getCaseDocuments(selectedCase.id);
    setDocuments(docs);
  };

  const uploadDocument = async (file: File, caseIdOverride?: string) => {
    // The upload view gets the case id from the URL. Do not silently fail when
    // the global selectedCase state has not finished loading yet.
    const caseId = caseIdOverride || selectedCase?.id;
    if (!caseId) {
      throw new Error('No case is selected. Open the document upload page from a valid case.');
    }

    const newDoc = await apiService.uploadDocument(caseId, file);
    setDocuments(prev => [newDoc, ...prev]);

    // Poll the real backend status while OCR/NLP runs in the background.
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const docs = await apiService.getCaseDocuments(caseId);
      setDocuments(docs);
      const current = docs.find(d => d.id === newDoc.id);
      if (!current) continue;
      if (current.status === 'COMPLETED' || current.status === 'FAILED') {
        if (current.status === 'FAILED') {
          throw new Error(current.errorMessage || 'Document processing failed');
        }
        const exts = await apiService.getExtractions(caseId);
        setExtractions(exts);
        return;
      }
    }
    throw new Error('Document processing timed out. Check document status for details.');
  };

  // Node & Edge selection
  const selectNode = (nodeId: string | null) => {
    if (!nodeId) {
      setSelectedNode(null);
      return;
    }
    const node = graphNodes.find(n => n.id === nodeId) || null;
    setSelectedNode(node);
    setSelectedEdge(null);
    setActiveContextTab('INSPECTOR');
  };

  const selectEdge = (edgeId: string | null) => {
    if (!edgeId) {
      setSelectedEdge(null);
      return;
    }
    const edge = graphEdges.find(e => e.id === edgeId) || null;
    setSelectedEdge(edge);
    setSelectedNode(null);
    setActiveContextTab('INSPECTOR');
  };

  // Progressive Expansion (Section 5)
  const expandNode = async (nodeId: string) => {
    if (!selectedCase) return;
    try {
      const { addedNodes, addedEdges } = await apiService.expandNode(selectedCase.id, nodeId);
      if (addedNodes.length > 0 || addedEdges.length > 0) {
        setGraphNodes(prev => {
          const ids = new Set(prev.map(n => n.id));
          return [...prev, ...addedNodes.filter(n => !ids.has(n.id))];
        });
        setGraphEdges(prev => {
          const ids = new Set(prev.map(e => e.id));
          return [...prev, ...addedEdges.filter(e => !ids.has(e.id))];
        });
        setExpandedNodeIds(prev => new Set([...prev, nodeId]));
      }
    } catch (err: any) {
      console.error('Error expanding node:', err);
    }
  };

  const centerFocusOnNode = (nodeId: string) => {
    setFocusNodeId(nodeId);
    selectNode(nodeId);
  };

  const resetGraphToCase = () => {
    if (!selectedCase) return;
    const rootNode = graphNodes.find(n => n.isRoot);
    if (rootNode) {
      setFocusNodeId(rootNode.id);
      setSelectedNode(rootNode);
      setSelectedEdge(null);
      setHighlightedNodeIds(new Set());
    }
  };

  const setHighlightedNodes = (nodeIds: string[]) => {
    setHighlightedNodeIds(new Set(nodeIds));
  };

  // Timeline selection
  const selectTimelineEvent = (event: TimelineEvent) => {
    setHighlightedNodes(event.relatedNodeIds);
    if (event.relatedNodeIds.length > 0) {
      selectNode(event.relatedNodeIds[0]);
    }
  };

  // Extractions
  const handleExtractionAction = async (
    candidateId: string,
    action: 'APPROVE' | 'REJECT' | 'EDIT',
    params?: { editedValue?: string; rejectionReason?: string; reviewerNotes?: string }
  ) => {
    const updated = await apiService.reviewExtraction(candidateId, action, {
      ...params,
      officerName: currentUser.name
    });
    setExtractions(prev => prev.map(e => (e.id === candidateId ? updated : e)));
    // If approved, reload graph nodes
    if (action === 'APPROVE' && selectedCase) {
      const graph = await apiService.getCaseGraph(selectedCase.id);
      setGraphNodes(graph.nodes);
      setGraphEdges(graph.edges);
    }
  };

  // Match review
  const handleMatchDecision = async (matchId: string, decision: 'CONFIRM' | 'REJECT') => {
    const { match: updatedMatch, refreshedGraph } = await apiService.decideEntityMatch(
      matchId,
      decision,
      currentUser.name
    );
    setMatches(prev => prev.map(m => (m.id === matchId ? updatedMatch : m)));
    setGraphNodes(refreshedGraph.nodes);
    setGraphEdges(refreshedGraph.edges);
  };

  // Grounded Assistant
  const askAssistant = async (query: string) => {
    if (!query.trim() || !selectedCase) return;
    const userMsg: AssistantMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content: query
    };
    setAssistantMessages(prev => [...prev, userMsg]);
    setIsAiResponding(true);

    try {
      const response = await apiService.queryGroundedAssistant(selectedCase.id, query);
      setAssistantMessages(prev => [...prev, response]);
      if (response.pathNodes && response.pathNodes.length > 0) {
        setHighlightedNodes(response.pathNodes);
      }
    } catch (err: any) {
      setAssistantMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          content: 'An error occurred while evaluating grounded evidence. Please retry.',
          insufficientEvidence: true
        }
      ]);
    } finally {
      setIsAiResponding(false);
    }
  };

  const executeAiAction = (action: { type: string; payload: any }) => {
    if (action.type === 'HIGHLIGHT_PATH') {
      setHighlightedNodes(action.payload as string[]);
      if (action.payload.length > 0) {
        centerFocusOnNode(action.payload[0]);
      }
    } else if (action.type === 'VIEW_EVIDENCE') {
      window.location.hash = `#/evidence/${action.payload}`;
    }
  };

  return (
    <InvestigationContext.Provider
      value={{
        currentUser,
        isMockMode,
        toggleMockMode,
        cases,
        selectedCase,
        selectCase,
        reloadCases,
        graphNodes,
        graphEdges,
        selectedNode,
        selectedEdge,
        expandedNodeIds,
        highlightedNodeIds,
        focusNodeId,
        graphFilters,
        setGraphFilters,
        selectNode,
        selectEdge,
        expandNode,
        centerFocusOnNode,
        resetGraphToCase,
        setHighlightedNodes,
        timelineEvents,
        timelineFilters,
        setTimelineFilters,
        selectTimelineEvent,
        patterns,
        analytics,
        documents,
        reloadDocuments,
        uploadDocument,
        extractions,
        handleExtractionAction,
        matches,
        handleMatchDecision,
        assistantMessages,
        isAiResponding,
        askAssistant,
        executeAiAction,
        activeContextTab,
        setActiveContextTab,
        isLoading,
        error
      }}
    >
      {children}
    </InvestigationContext.Provider>
  );
};

export const useInvestigation = () => {
  const ctx = useContext(InvestigationContext);
  if (!ctx) {
    throw new Error('useInvestigation must be used within an InvestigationProvider');
  }
  return ctx;
};
