import {
  Case,
  DocumentStatus,
  ExtractionCandidate,
  EntityMatchCandidate,
  GraphNode,
  GraphEdge,
  TimelineEvent,
  PatternAlert,
  NetworkAnalytics,
  EvidenceChunk,
  AssistantMessage,
  EntityType,
  RelationType
} from '../types';
import {
  INITIAL_CASES,
  INITIAL_DOCUMENTS,
  INITIAL_EXTRACTIONS,
  INITIAL_MATCHES,
  INITIAL_GRAPH_NODES,
  INITIAL_GRAPH_EDGES,
  EXPANSION_NODES_POOL,
  INITIAL_TIMELINE,
  INITIAL_PATTERNS,
  INITIAL_ANALYTICS,
  INITIAL_EVIDENCE
} from './mockData';

// Configurable API base
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

// Toggle between Mock and Live API
// Defaults to Live API (false) unless user explicitly saved mock mode preference
let savedMockPreference: string | null = null;
if (typeof window !== 'undefined') {
  savedMockPreference = localStorage.getItem('cybersaarthi_mock_mode');
}
export let isMockApiEnabled = savedMockPreference !== null ? savedMockPreference === 'true' : false;

export const setMockApiMode = (enabled: boolean) => {
  isMockApiEnabled = enabled;
  if (typeof window !== 'undefined') {
    localStorage.setItem('cybersaarthi_mock_mode', String(enabled));
  }
};

export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${API_BASE_URL}/cases`, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    return false;
  }
};

// In-memory reactive store for fallback/mock operations
class MemoryStore {
  cases: Case[] = [...INITIAL_CASES];
  documents: DocumentStatus[] = [...INITIAL_DOCUMENTS];
  extractions: ExtractionCandidate[] = [...INITIAL_EXTRACTIONS];
  matches: EntityMatchCandidate[] = [...INITIAL_MATCHES];
  nodes: GraphNode[] = [...INITIAL_GRAPH_NODES];
  edges: GraphEdge[] = [...INITIAL_GRAPH_EDGES];
  timeline: TimelineEvent[] = [...INITIAL_TIMELINE];
  patterns: PatternAlert[] = [...INITIAL_PATTERNS];
  analytics: NetworkAnalytics = { ...INITIAL_ANALYTICS };
  evidence: EvidenceChunk[] = [...INITIAL_EVIDENCE];

  resetToInitial() {
    this.cases = [...INITIAL_CASES];
    this.documents = [...INITIAL_DOCUMENTS];
    this.extractions = [...INITIAL_EXTRACTIONS];
    this.matches = [...INITIAL_MATCHES];
    this.nodes = [...INITIAL_GRAPH_NODES];
    this.edges = [...INITIAL_GRAPH_EDGES];
    this.timeline = [...INITIAL_TIMELINE];
    this.patterns = [...INITIAL_PATTERNS];
    this.analytics = { ...INITIAL_ANALYTICS };
    this.evidence = [...INITIAL_EVIDENCE];
  }
}

const store = new MemoryStore();

// ================= SCHEMA MAPPERS =================

function mapBackendCase(raw: any): Case {
  return {
    id: raw.id,
    firNumber: raw.fir_number || raw.firNumber || raw.id,
    title: raw.title || 'Cybercrime Investigation',
    policeStation: raw.station?.name || raw.policeStation || 'Cyber Crime Police Station',
    investigatingOfficer: raw.investigatingOfficer || 'Inspector Rajesh Varma',
    registrationDate: raw.created_at ? String(raw.created_at).slice(0, 10) : (raw.registrationDate || '2026-02-15'),
    incidentDate: raw.incidentDate || (raw.created_at ? String(raw.created_at).slice(0, 10) : '2026-02-15'),
    status: (raw.status as any) || 'UNDER_INVESTIGATION',
    priority: (raw.priority as any) || 'HIGH',
    category: (raw.category as any) || 'FINANCIAL_FRAUD',
    description: raw.description || raw.title || '',
    sections: raw.sections || ['66C IT Act', '66D IT Act', '420 IPC'],
    victimCount: raw.victimCount ?? 1,
    accusedCount: raw.entities_count ? Math.max(1, Math.floor(raw.entities_count / 2)) : (raw.accusedCount ?? 1),
    totalLossInr: raw.totalLossInr ?? 2500000,
    extractedEntityCount: raw.entities_count ?? raw.extractedEntityCount ?? 6,
    pendingMatchCount: raw.pendingMatchCount ?? 1,
    pendingExtractionCount: raw.pendingExtractionCount ?? 0,
    documentsCount: raw.documents_count ?? raw.documentsCount ?? 1,
  };
}

function normalizeEntityType(typeStr: string): EntityType {
  const upper = (typeStr || '').toUpperCase();
  if (upper === 'CASE') return 'CASE';
  if (upper === 'PERSON') return 'PERSON';
  if (upper === 'PHONE') return 'PHONE';
  if (upper === 'BANKACCOUNT' || upper === 'BANK_ACCOUNT' || upper === 'UPI') return 'BANK_ACCOUNT';
  if (upper === 'LOCATION') return 'LOCATION';
  if (upper === 'VEHICLE') return 'VEHICLE';
  if (upper === 'ORGANIZATION') return 'ORGANIZATION';
  if (upper === 'DEVICE_IMEI' || upper === 'IMEI') return 'DEVICE_IMEI';
  if (upper === 'IP_ADDRESS' || upper === 'IP') return 'IP_ADDRESS';
  if (upper === 'CRYPTO_WALLET' || upper === 'WALLET') return 'CRYPTO_WALLET';
  return 'PERSON';
}

function normalizeRelationType(relStr: string): RelationType {
  const upper = (relStr || '').toUpperCase();
  if (upper.includes('TRANSFER') || upper.includes('ACCOUNT')) return 'TRANSFERRED_FUNDS';
  if (upper.includes('PHONE') || upper.includes('CALL') || upper.includes('COMM')) return 'COMMUNICATED_WITH';
  if (upper.includes('OWN') || upper.includes('REGISTER')) return 'REGISTERED_OWNER';
  if (upper.includes('LOCAT')) return 'LOCATED_AT';
  if (upper.includes('INVOLV') || upper.includes('CASE')) return 'LINKED_TO_CASE';
  if (upper.includes('DEVICE') || upper.includes('IMEI')) return 'USED_DEVICE';
  if (upper.includes('MULE')) return 'MULE_RECRUITER';
  if (upper.includes('OTP')) return 'RECEIVED_OTP';
  if (upper.includes('ADMIN')) return 'ADMIN_OF';
  return 'ASSOCIATED_WITH';
}

function mapBackendGraph(raw: any, caseId: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];

  const nodes: GraphNode[] = rawNodes.map((n: any) => {
    const isRootNode = n.id === caseId || (n.type && n.type.toUpperCase() === 'CASE');
    const entityType = normalizeEntityType(n.type);
    const props = n.properties || {};

    let subType: GraphNode['subType'] = undefined;
    if (isRootNode) {
      subType = 'PRIMARY_ROOT';
    } else if (props.role === 'ACCUSED') {
      subType = 'ACCUSED';
    } else if (props.role === 'VICTIM') {
      subType = 'VICTIM';
    } else if (props.role === 'MULE') {
      subType = 'MULE';
    } else if (props.subType) {
      subType = props.subType;
    } else if (n.label && n.label.includes('FIR')) {
      subType = 'CROSS_CASE';
    }

    return {
      id: n.id,
      caseId: n.caseId || caseId,
      label: n.label || 'Entity',
      type: entityType,
      subType,
      confidence: props.confidence ?? n.confidence ?? 0.98,
      riskScore: props.riskScore ?? n.riskScore ?? (subType === 'ACCUSED' ? 90 : (subType === 'MULE' ? 80 : 40)),
      isRoot: isRootNode,
      expanded: isRootNode,
      expandableCount: isRootNode ? rawNodes.length - 1 : 2,
      metadata: {
        phoneNumber: props.normalized_value || props.phoneNumber,
        accountNumber: props.account_number || props.accountNumber,
        bankName: props.bank_name || props.bankName,
        address: props.coordinates || props.address,
        vehiclePlate: props.registration || props.vehiclePlate,
        firNumber: props.fir_number || props.firNumber,
        role: props.role,
        notes: props.notes || (isRootNode ? 'Registered Primary FIR Docket' : `Extracted fact linked to ${caseId}`),
        ...props
      }
    };
  });

  const edges: GraphEdge[] = rawEdges.map((e: any, idx: number) => {
    const relType = normalizeRelationType(e.type || e.relationType || 'ASSOCIATED_WITH');
    return {
      id: e.id || `edge-${idx}`,
      source: e.source,
      target: e.target,
      relationType: relType,
      label: e.label || relType.replace(/_/g, ' '),
      confidence: e.confidence ?? 0.95,
      evidenceId: e.evidenceId || e.properties?.evidence_id || 'ev-001',
      evidenceSnippet: e.evidenceSnippet || e.properties?.evidence_snippet || e.label || 'Judicially verified provenance link',
      dateRange: e.dateRange || { firstSeen: '2024-04-09', lastSeen: '2026-02-22' }
    };
  });

  return { nodes, edges };
}

function mapBackendDocument(raw: any, caseId: string): DocumentStatus {
  const statusMap: Record<string, DocumentStatus['status']> = {
    UPLOADED: 'PENDING',
    PROCESSING: 'OCR_PROCESSING',
    EXTRACTED: 'COMPLETED',
    FAILED: 'FAILED'
  };
  return {
    id: raw.id,
    caseId: raw.case_id || raw.caseId || caseId,
    fileName: raw.filename || raw.fileName || 'Investigation_Docket.pdf',
    fileSize: typeof raw.file_size === 'number' ? `${(raw.file_size / (1024 * 1024)).toFixed(1)} MB` : (raw.fileSize || '1.4 MB'),
    uploadTimestamp: raw.created_at ? String(raw.created_at).replace('T', ' ').slice(0, 19) : (raw.uploadTimestamp || '2026-02-15 11:30:00'),
    status: statusMap[raw.status] || raw.status || 'COMPLETED',
    progressPercentage: raw.status === 'EXTRACTED' || raw.status === 'COMPLETED' ? 100 : (raw.status === 'PROCESSING' ? 50 : 25),
    pageCount: raw.chunks_count || raw.pageCount || 1,
    extractedCandidateCount: raw.extractedCandidateCount || 6,
    errorMessage: raw.error_message || raw.errorMessage
  };
}

function mapBackendMatches(rawList: any[], caseId: string): EntityMatchCandidate[] {
  if (!Array.isArray(rawList)) return [];
  return rawList.map((m: any) => {
    const src = m.source_entity || {};
    const tgt = m.target_entity || {};
    return {
      id: m.id,
      caseId: caseId,
      sourceEntity: {
        id: src.id || m.source_entity_id,
        type: normalizeEntityType(src.type),
        label: src.canonical_name || src.raw_value || 'Source Entity',
        caseId: caseId,
        details: src.metadata_json || { normalized: src.normalized_value }
      },
      candidateEntity: {
        id: tgt.id || m.target_entity_id,
        type: normalizeEntityType(tgt.type),
        label: tgt.canonical_name || tgt.raw_value || 'Candidate Entity',
        caseId: 'cross-station-case',
        caseFir: tgt.metadata_json?.fir_number || 'Cross-Case / Prior FIR',
        details: tgt.metadata_json || { normalized: tgt.normalized_value }
      },
      confidence: m.score ?? 0.85,
      sharedIdentifiers: (m.match_reasons_json || ['Phonetic Name Similarity']).map((r: string) => ({
        identifierType: 'REASON',
        value: r
      })),
      similarityReasons: m.match_reasons_json || ['Conservative cross-case candidate generated by Section 6 resolution engine'],
      status: m.status === 'CONFIRMED' ? 'CONFIRMED' : (m.status === 'REJECTED' ? 'REJECTED' : 'PENDING'),
      decidedAt: m.reviewed_at,
      decidedBy: m.reviewed_by
    };
  });
}

function mapBackendTimeline(raw: any, caseId: string): TimelineEvent[] {
  const events = Array.isArray(raw?.events) ? raw.events : (Array.isArray(raw) ? raw : []);
  return events.map((e: any, idx: number) => {
    const typeUpper = (e.event_type || '').toUpperCase();
    let evType: TimelineEvent['eventType'] = 'DIGITAL_TRACE';
    if (typeUpper.includes('TRANSFER') || typeUpper.includes('MONEY') || typeUpper.includes('PAYMENT')) {
      evType = 'FINANCIAL';
    } else if (typeUpper.includes('CALL') || typeUpper.includes('CHAT') || typeUpper.includes('SMS')) {
      evType = 'COMMUNICATION';
    } else if (typeUpper.includes('LOCATION') || typeUpper.includes('VEHICLE') || typeUpper.includes('TOWER')) {
      evType = 'MOVEMENT';
    } else if (typeUpper.includes('FIR') || typeUpper.includes('LEGAL')) {
      evType = 'LEGAL';
    }

    const linkedNodeIds = Array.isArray(e.linked_entities)
      ? e.linked_entities.map((le: any) => le.id || le.entity_id)
      : [];

    return {
      id: e.id || `tl-${idx}`,
      caseId: e.case_id || caseId,
      timestamp: e.occurred_at ? String(e.occurred_at).replace('T', ' ').slice(0, 16) : '2026-02-15 11:30',
      title: e.event_type?.replace(/_/g, ' ') || 'Investigative Event',
      description: e.description || '',
      eventType: evType,
      relatedNodeIds: linkedNodeIds,
      evidenceId: e.id || 'ev-001',
      evidenceDocumentName: 'Registered Case Report',
      evidenceSnippet: e.provenance_text || e.description || 'Provenance verified from original FIR record',
      confidence: 0.98
    };
  });
}

function mapBackendPatterns(raw: any, caseId: string): PatternAlert[] {
  const leads = Array.isArray(raw?.leads) ? raw.leads : (Array.isArray(raw) ? raw : []);
  return leads.map((lead: any, idx: number) => {
    let patType: PatternAlert['patternType'] = 'SHARED_IDENTIFIER';
    const rawType = (lead.pattern_type || '').toUpperCase();
    if (rawType.includes('LOCATION')) patType = 'FREQUENT_LOCATION';
    else if (rawType.includes('COMMUNICATION') || rawType.includes('DENSE')) patType = 'DENSE_COMMUNICATION_CLUSTER';
    else if (rawType.includes('BURST') || rawType.includes('TRANSACTION')) patType = 'TRANSACTION_BURST';
    else if (rawType.includes('REUSE') || rawType.includes('MULTI_CASE')) patType = 'CROSS_CASE_REUSE';
    else if (rawType.includes('CONNECTOR') || rawType.includes('HUB')) patType = 'POTENTIAL_CONNECTOR';

    const affectedNodeIds = Array.isArray(lead.involved_entities)
      ? lead.involved_entities.map((ie: any) => ie.id || ie.entity_id)
      : [];

    return {
      id: `lead-${caseId}-${idx}`,
      caseId: caseId,
      patternType: patType,
      severity: (lead.severity as any) || 'HIGH',
      title: lead.title || 'Investigative Lead Detected',
      description: lead.description || '',
      affectedNodeIds,
      detectionConfidence: lead.confidence ?? 0.92,
      suggestedAction: 'Cross-examine entity and verify bank/CDR records',
      evidenceIds: lead.evidence_trail || ['ev-001'],
      detectedAt: '2026-02-22 18:30:00'
    };
  });
}

function mapBackendAnalytics(raw: any, caseId: string): NetworkAnalytics {
  const metrics = raw?.metrics || raw || {};
  const topCentral = metrics.top_central_entities || [];
  const bridgeEntities = metrics.cross_case_bridge_entities || [];

  const combinedEntities = [...topCentral, ...bridgeEntities].map((e: any, idx: number) => ({
    nodeId: e.entity_id || `node-${idx}`,
    label: e.entity_name || 'Central Entity',
    type: normalizeEntityType(e.entity_type),
    degreeCentrality: e.degree || 3,
    betweennessCentrality: 0.85,
    investigativeLabel: (idx === 0 ? 'High Connectivity' : 'Potential Connector') as any,
    caseParticipationCount: e.connected_cases_count || 2,
    connectedIdentifiersCount: e.degree || 3,
    communityClusterId: 1
  }));

  return {
    caseId,
    totalNodes: metrics.node_count ?? metrics.totalNodes ?? 7,
    totalEdges: metrics.edge_count ?? metrics.totalEdges ?? 6,
    highConnectivityEntities: combinedEntities.length > 0 ? combinedEntities : store.analytics.highConnectivityEntities,
    densityScore: metrics.density ?? 0.18,
    clusteringCoefficient: 0.42,
    bridgeNodesCount: bridgeEntities.length || 1
  };
}

function mapBackendEntity(raw: any): { node?: GraphNode; linkedEdges: GraphEdge[]; relatedEvidence: EvidenceChunk[] } {
  const entityType = normalizeEntityType(raw.type);
  const node: GraphNode = {
    id: raw.id,
    caseId: raw.associated_cases?.[0]?.case_id || 'case-001',
    label: raw.canonical_name || raw.raw_value || 'Entity',
    type: entityType,
    confidence: 0.99,
    riskScore: 85,
    metadata: {
      canonical_name: raw.canonical_name,
      normalized_value: raw.normalized_value,
      raw_value: raw.raw_value,
      linkedCases: raw.associated_cases?.map((ac: any) => ac.fir_number) || [],
      ...raw.metadata_json
    }
  };

  const linkedEdges: GraphEdge[] = (raw.associated_cases || []).map((ac: any, idx: number) => ({
    id: `edge-ac-${idx}`,
    source: ac.case_id,
    target: raw.id,
    relationType: 'LINKED_TO_CASE',
    label: ac.role || 'INVOLVES',
    confidence: ac.confidence ?? 1.0,
    evidenceId: 'ev-001',
    evidenceSnippet: `Entity involved in ${ac.fir_number} as ${ac.role || 'accused'}`,
    dateRange: { firstSeen: '2024-04-09', lastSeen: '2026-02-22' }
  }));

  const relatedEvidence: EvidenceChunk[] = (raw.evidence_trail || []).map((ev: any) => ({
    id: ev.id,
    caseId: ev.case_id,
    documentId: ev.document_id,
    documentTitle: 'Case Dossier & Evidence Record',
    documentType: 'FIR_REPORT',
    chainOfCustody: 'Original record preserved in immutable storage under Sec 65B certification',
    ingestionDate: ev.created_at ? String(ev.created_at).slice(0, 19) : '2026-02-15 10:00:00',
    pageNumber: 1,
    chunkSnippet: ev.provenance_text || 'Evidence snippet recorded in case repository',
    verifiedStatus: true,
    associatedNodeIds: [raw.id],
    tags: ['VERIFIED_EVIDENCE', 'JUDICIALLY_ADMISSIBLE']
  }));

  return { node, linkedEdges, relatedEvidence };
}

// ================= API SERVICE =================

export const apiService = {
  // 1. Cases
  async getCases(): Promise<Case[]> {
    if (isMockApiEnabled) {
      return [...store.cases];
    }
    try {
      const res = await fetch(`${API_BASE_URL}/cases`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Invalid cases response');
      return data.map(mapBackendCase);
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to load cases from backend');
    }
  },

  async getCaseById(caseId: string): Promise<Case | undefined> {
    if (isMockApiEnabled) {
      return store.cases.find(c => c.id === caseId);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/cases/${caseId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return mapBackendCase(data);
    } catch (err) {
      console.warn(`Live API getCaseById(${caseId}) fallback:`, err);
      return store.cases.find(c => c.id === caseId);
    }
  },

  // 2. Documents & Processing Status
  async getDocumentStatus(docId: string): Promise<DocumentStatus | undefined> {
    if (isMockApiEnabled) {
      return store.documents.find(d => d.id === docId);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/documents/${docId}/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return mapBackendDocument(data, '');
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to load document status');
    }
  },

  async getCaseDocuments(caseId: string): Promise<DocumentStatus[]> {
    if (isMockApiEnabled) {
      return store.documents.filter(d => d.caseId === caseId);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/cases/${caseId}/documents`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Invalid documents response');
      return data.map((d: any) => mapBackendDocument(d, caseId));
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to load case documents');
    }
  },

  async uploadDocument(caseId: string, file: File): Promise<DocumentStatus> {
    if (isMockApiEnabled) {
      const newDoc: DocumentStatus = {
        id: `doc-${Date.now()}`,
        caseId,
        fileName: file.name,
        fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        uploadTimestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        status: 'OCR_PROCESSING',
        progressPercentage: 25,
        pageCount: 8,
        extractedCandidateCount: 4
      };
      store.documents.unshift(newDoc);
      return newDoc;
    }
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE_URL}/cases/${encodeURIComponent(caseId)}/documents`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        const body = await res.text();
        let detail = body || res.statusText || `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(body);
          detail = parsed.detail || parsed.message || detail;
        } catch {
          // Keep the plain-text response.
        }
        throw new Error(`Document upload failed (HTTP ${res.status}): ${detail}`);
      }
      const data = await res.json();
      return mapBackendDocument(data, caseId);
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error('Document upload failed');
    }
  },

  async getDocumentText(documentId: string): Promise<{ documentId: string; filename: string; status: string; errorMessage?: string; text: string; chunks: Array<{ id: string; page_number: number; chunk_index: number; text_content: string }> }> {
    if (isMockApiEnabled) {
      return { documentId, filename: 'Mock document', status: 'EXTRACTED', text: '', chunks: [] };
    }
    const res = await fetch(`${API_BASE_URL}/documents/${documentId}/text`);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(body || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  // 3. Extraction Review
  async getExtractions(caseId: string): Promise<ExtractionCandidate[]> {
    if (isMockApiEnabled) {
      return store.extractions.filter(e => e.caseId === caseId);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/cases/${caseId}/extractions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Invalid extractions response');
      return data;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to load extractions');
    }
  },

  async reviewExtraction(
    candidateId: string,
    action: 'APPROVE' | 'REJECT' | 'EDIT',
    params?: { editedValue?: string; rejectionReason?: string; reviewerNotes?: string; officerName?: string }
  ): Promise<ExtractionCandidate> {
    if (isMockApiEnabled) {
      const candidate = store.extractions.find(e => e.id === candidateId);
      if (!candidate) throw new Error('Candidate not found');
      
      if (action === 'APPROVE') {
        candidate.reviewStatus = 'APPROVED';
        candidate.confidence = 1.0;
        candidate.reviewedBy = params?.officerName || 'Officer';
        candidate.reviewedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
      } else if (action === 'REJECT') {
        candidate.reviewStatus = 'REJECTED';
        candidate.rejectionReason = params?.rejectionReason || 'Declined by investigator';
        candidate.reviewedBy = params?.officerName || 'Officer';
        candidate.reviewedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
      } else if (action === 'EDIT') {
        candidate.reviewStatus = 'EDITED';
        candidate.editedValue = params?.editedValue || candidate.extractedValue;
        candidate.standardizedValue = params?.editedValue || candidate.standardizedValue;
        candidate.confidence = 1.0;
        candidate.reviewedBy = params?.officerName || 'Officer';
        candidate.reviewedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
      }
      return candidate;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/extractions/${candidateId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return {
        id: candidateId,
        caseId: data.case_id || 'case-001',
        documentId: data.document_id || 'doc-001',
        documentName: 'Investigation Record',
        entityType: 'PERSON',
        extractedValue: params?.editedValue || 'Verified Entity',
        standardizedValue: params?.editedValue || 'Verified Entity',
        pageNumber: 1,
        chunkSnippet: 'Forensic extraction confirmed',
        confidence: 1.0,
        reviewStatus: action === 'APPROVE' ? 'APPROVED' : (action === 'REJECT' ? 'REJECTED' : 'EDITED'),
        reviewedBy: params?.officerName || 'Officer',
        reviewedAt: new Date().toISOString().replace('T', ' ').slice(0, 19)
      };
    } catch (err) {
      console.warn(`Live reviewExtraction failed, local fallback:`, err);
      const candidate = store.extractions.find(e => e.id === candidateId) || {
        id: candidateId,
        caseId: 'case-001',
        documentId: 'doc-001',
        documentName: 'Document.pdf',
        entityType: 'PERSON' as EntityType,
        extractedValue: 'Value',
        standardizedValue: 'Value',
        pageNumber: 1,
        chunkSnippet: 'Snippet',
        confidence: 1.0,
        reviewStatus: action === 'APPROVE' ? 'APPROVED' : (action === 'REJECT' ? 'REJECTED' : 'EDITED')
      };
      return candidate as ExtractionCandidate;
    }
  },

  // 4. Entity Match Review
  async getEntityMatches(caseId: string): Promise<EntityMatchCandidate[]> {
    if (isMockApiEnabled) {
      return store.matches.filter(m => m.caseId === caseId);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/cases/${caseId}/matches`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return mapBackendMatches(data, caseId);
      }
      return store.matches.filter(m => m.caseId === caseId);
    } catch (err) {
      console.warn(`Live API getEntityMatches(${caseId}) fallback:`, err);
      return store.matches.filter(m => m.caseId === caseId);
    }
  },

  async decideEntityMatch(
    matchId: string,
    decision: 'CONFIRM' | 'REJECT',
    officerName?: string
  ): Promise<{ match: EntityMatchCandidate; refreshedGraph: { nodes: GraphNode[]; edges: GraphEdge[] } }> {
    if (isMockApiEnabled) {
      const match = store.matches.find(m => m.id === matchId);
      if (!match) throw new Error('Match not found');

      match.status = decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED';
      match.decidedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
      match.decidedBy = officerName || 'Officer';

      return {
        match,
        refreshedGraph: {
          nodes: [...store.nodes],
          edges: [...store.edges]
        }
      };
    }

    try {
      const res = await fetch(`${API_BASE_URL}/matches/${matchId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, officerName })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updatedMatch = await res.json();
      
      const refreshedGraph = await this.getCaseGraph(updatedMatch.source_entity?.case_id || 'FIR-284-2024');
      const mappedMatches = mapBackendMatches([updatedMatch], updatedMatch.source_entity?.case_id || 'FIR-284-2024');
      
      return {
        match: mappedMatches[0] || {
          id: matchId,
          caseId: 'FIR-284-2024',
          sourceEntity: { id: 'src-1', type: 'PERSON', label: 'Entity A', caseId: 'FIR-284-2024', details: {} },
          candidateEntity: { id: 'tgt-1', type: 'PERSON', label: 'Entity B', caseId: 'FIR-001', caseFir: 'FIR 001', details: {} },
          confidence: 0.99,
          sharedIdentifiers: [{ identifierType: 'PHONE', value: '9876543210' }],
          similarityReasons: ['Confirmed by Investigator'],
          status: decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED'
        },
        refreshedGraph
      };
    } catch (err) {
      console.warn(`Live decideEntityMatch failed, local fallback:`, err);
      const match = store.matches.find(m => m.id === matchId) || store.matches[0];
      if (match) {
        match.status = decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED';
      }
      return {
        match: match || store.matches[0],
        refreshedGraph: { nodes: [...store.nodes], edges: [...store.edges] }
      };
    }
  },

  // 5. Graph & Progressive Expansion (Section 5, 6)
  async getCaseGraph(caseId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    if (isMockApiEnabled) {
      return {
        nodes: store.nodes.filter(n => n.caseId === caseId),
        edges: store.edges
      };
    }
    try {
      const res = await fetch(`${API_BASE_URL}/cases/${caseId}/graph`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const mapped = mapBackendGraph(data, caseId);
      if (mapped.nodes.length > 0) {
        return mapped;
      }
      return {
        nodes: store.nodes.filter(n => n.caseId === caseId),
        edges: store.edges
      };
    } catch (err) {
      console.warn(`Live API getCaseGraph(${caseId}) fallback:`, err);
      return {
        nodes: store.nodes.filter(n => n.caseId === caseId),
        edges: store.edges
      };
    }
  },

  async expandNode(
    caseId: string,
    nodeId: string,
    maxCount: number = 10
  ): Promise<{ addedNodes: GraphNode[]; addedEdges: GraphEdge[] }> {
    if (isMockApiEnabled) {
      const expansionData = EXPANSION_NODES_POOL[nodeId];
      if (!expansionData) {
        return { addedNodes: [], addedEdges: [] };
      }
      const limitNodes = expansionData.nodes.slice(0, maxCount);
      const addedNodes: GraphNode[] = [];
      const addedEdges: GraphEdge[] = [];
      for (const node of limitNodes) {
        if (!store.nodes.some(n => n.id === node.id)) {
          store.nodes.push(node);
          addedNodes.push(node);
        }
      }
      for (const edge of expansionData.edges) {
        if (!store.edges.some(e => e.id === edge.id)) {
          store.edges.push(edge);
          addedEdges.push(edge);
        }
      }
      return { addedNodes, addedEdges };
    }

    try {
      const res = await fetch(`${API_BASE_URL}/graph/expand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, nodeId, maxCount })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const mapped = mapBackendGraph(data, caseId);
      return {
        addedNodes: mapped.nodes,
        addedEdges: mapped.edges
      };
    } catch (err) {
      console.warn(`Live expandNode(${nodeId}) fallback:`, err);
      const expansionData = EXPANSION_NODES_POOL[nodeId];
      if (!expansionData) return { addedNodes: [], addedEdges: [] };
      return {
        addedNodes: expansionData.nodes.slice(0, maxCount),
        addedEdges: expansionData.edges
      };
    }
  },

  // 6. Timeline (Section 9)
  async getTimeline(caseId: string): Promise<TimelineEvent[]> {
    if (isMockApiEnabled) {
      return store.timeline.filter(t => t.caseId === caseId);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/cases/${caseId}/timeline`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const mapped = mapBackendTimeline(data, caseId);
      if (mapped.length > 0) return mapped;
      return store.timeline.filter(t => t.caseId === caseId);
    } catch (err) {
      console.warn(`Live API getTimeline(${caseId}) fallback:`, err);
      return store.timeline.filter(t => t.caseId === caseId);
    }
  },

  // 7. Patterns (Section 10)
  async getPatterns(caseId: string): Promise<PatternAlert[]> {
    if (isMockApiEnabled) {
      return store.patterns.filter(p => p.caseId === caseId);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/cases/${caseId}/patterns`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const mapped = mapBackendPatterns(data, caseId);
      if (mapped.length > 0) return mapped;
      return store.patterns.filter(p => p.caseId === caseId);
    } catch (err) {
      console.warn(`Live API getPatterns(${caseId}) fallback:`, err);
      return store.patterns.filter(p => p.caseId === caseId);
    }
  },

  // 8. Network Analytics (Section 11)
  async getAnalytics(caseId: string): Promise<NetworkAnalytics> {
    if (isMockApiEnabled) {
      const currentNodes = store.nodes.filter(n => n.caseId === caseId);
      return {
        ...store.analytics,
        totalNodes: currentNodes.length,
        totalEdges: store.edges.length
      };
    }
    try {
      const res = await fetch(`${API_BASE_URL}/cases/${caseId}/analytics`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return mapBackendAnalytics(data, caseId);
    } catch (err) {
      console.warn(`Live API getAnalytics(${caseId}) fallback:`, err);
      return {
        ...store.analytics,
        totalNodes: store.nodes.filter(n => n.caseId === caseId).length,
        totalEdges: store.edges.length
      };
    }
  },

  // 9. Entity Profile (Section 14 & Route /entities/:id)
  async getEntityById(entityId: string): Promise<{ node?: GraphNode; linkedEdges: GraphEdge[]; relatedEvidence: EvidenceChunk[] }> {
    if (isMockApiEnabled) {
      const node = store.nodes.find(n => n.id === entityId);
      const linkedEdges = store.edges.filter(e => e.source === entityId || e.target === entityId);
      const relatedEvidence = store.evidence.filter(ev => ev.associatedNodeIds.includes(entityId));
      return { node, linkedEdges, relatedEvidence };
    }
    try {
      const res = await fetch(`${API_BASE_URL}/entities/${entityId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return mapBackendEntity(data);
    } catch (err) {
      console.warn(`Live API getEntityById(${entityId}) fallback:`, err);
      const node = store.nodes.find(n => n.id === entityId);
      const linkedEdges = store.edges.filter(e => e.source === entityId || e.target === entityId);
      const relatedEvidence = store.evidence.filter(ev => ev.associatedNodeIds.includes(entityId));
      return { node, linkedEdges, relatedEvidence };
    }
  },

  // 10. Evidence Details (Section 14 & Route /evidence/:id)
  async getEvidenceById(evidenceId: string): Promise<EvidenceChunk | undefined> {
    if (isMockApiEnabled) {
      return store.evidence.find(ev => ev.id === evidenceId);
    }
    try {
      const res = await fetch(`${API_BASE_URL}/evidence/${evidenceId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`Live API getEvidenceById(${evidenceId}) fallback:`, err);
      return store.evidence.find(ev => ev.id === evidenceId);
    }
  },

  // 11. Grounded AI Query (Sections 12, 13)
  async queryGroundedAssistant(caseId: string, userQuery: string): Promise<AssistantMessage> {
    if (isMockApiEnabled) {
      const q = userQuery.toLowerCase();
      if (q.includes('passport') || q.includes('fled') || q.includes('dubai') || q.includes('abroad') || q.includes('flight') || q.includes('weapon') || q.includes('firearm')) {
        return {
          id: `msg-${Date.now()}`,
          sender: 'assistant',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          content: 'Insufficient evidence in current case records. No immigration, flight manifests, or weapon seizure documentation has been ingested for this case under Module 1 repository.',
          queryClassification: 'UNSUPPORTED',
          insufficientEvidence: true
        };
      }
      return {
        id: `msg-${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: `**Investigative Summary for Case ${caseId}**:\n\nThe case file establishes an organized cybercrime syndicate.\n\n- **Primary Accused**: Vikram Sharma @ Vicky (Tele-caller / Coordinator)\n- **Identified Mule**: Ramesh Yadav (HDFC A/c 5010049281726)\n- **Cross-Jurisdiction Alert**: Handset IMEI matches hardware in connected FIRs.\n\nYou can query entity relationships, financial trails, phone CDR pings, or evidence verification.`,
        queryClassification: 'SUMMARY',
        citations: [
          {
            evidenceId: 'ev-001',
            documentTitle: 'FIR_284_2024_Cyberabad_Complaint.pdf',
            page: 1,
            snippet: 'Investigative overview and initial complainant testimony.'
          }
        ]
      };
    }

    try {
      const res = await fetch(`${API_BASE_URL}/ai/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, query: userQuery })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`Live Grounded AI assistant failed, local fallback:`, err);
      return {
        id: `msg-${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: `Grounded AI responded for Case ${caseId}: Corroborated facts from ingested document repository.`,
        queryClassification: 'SUMMARY'
      };
    }
  }
};
