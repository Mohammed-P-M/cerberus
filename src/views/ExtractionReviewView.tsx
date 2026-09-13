import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useInvestigation } from '../context/InvestigationContext';
import { ExtractionCandidate, EntityType } from '../types';
import { apiService } from '../services/api';
import {
  FileCheck,
  CheckCircle2,
  XCircle,
  Edit3,
  AlertOctagon,
  FileText,
  Search,
  ExternalLink,
  ChevronRight,
  User,
  Phone,
  CreditCard,
  MapPin,
  Car,
  Building,
  Smartphone,
  Server,
  Filter,
  Check
} from 'lucide-react';

export const ExtractionReviewView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const {
    selectedCase,
    extractions,
    documents,
    handleExtractionAction,
    currentUser
  } = useInvestigation();

  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [documentText, setDocumentText] = useState<string>('');
  const [documentTextStatus, setDocumentTextStatus] = useState<string>('');
  const [selectedCandidate, setSelectedCandidate] = useState<ExtractionCandidate | null>(
    extractions[0] || null
  );
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [activeTypeFilter, setActiveTypeFilter] = useState<string>('ALL');

  // Filter extractions
  const filteredExtractions = extractions.filter((item) => {
    if (activeTypeFilter !== 'ALL' && item.entityType !== activeTypeFilter) return false;
    return true;
  });

  // Group by entity type (Section 7: Group candidates by entity type)
  const groupedByType = filteredExtractions.reduce((acc, curr) => {
    if (!acc[curr.entityType]) acc[curr.entityType] = [];
    acc[curr.entityType].push(curr);
    return acc;
  }, {} as Record<EntityType, ExtractionCandidate[]>);

  const handleApprove = async (candidateId: string) => {
    await handleExtractionAction(candidateId, 'APPROVE');
  };

  const handleReject = async (candidateId: string) => {
    await handleExtractionAction(candidateId, 'REJECT', {
      rejectionReason: 'Declined during IO review'
    });
  };

  const startEdit = (candidate: ExtractionCandidate) => {
    setEditingCandidateId(candidate.id);
    setEditValue(candidate.standardizedValue);
  };

  const saveEdit = async (candidateId: string) => {
    await handleExtractionAction(candidateId, 'EDIT', {
      editedValue: editValue
    });
    setEditingCandidateId(null);
  };

  useEffect(() => {
    if (!selectedDocId && documents.length > 0) {
      setSelectedDocId(documents[0].id);
    }
  }, [documents, selectedDocId]);

  useEffect(() => {
    let cancelled = false;
    const loadText = async () => {
      if (!selectedDocId) {
        setDocumentText('');
        return;
      }
      try {
        setDocumentTextStatus('Loading extracted document text...');
        const result = await apiService.getDocumentText(selectedDocId);
        if (!cancelled) {
          setDocumentText(result.text || 'No text has been extracted yet.');
          setDocumentTextStatus(result.status || '');
        }
      } catch (error) {
        if (!cancelled) {
          setDocumentText('Unable to load the extracted text from the backend.');
          setDocumentTextStatus(error instanceof Error ? error.message : 'Failed to load document text');
        }
      }
    };
    loadText();
    return () => { cancelled = true; };
  }, [selectedDocId]);

  const selectedDocument = documents.find(d => d.id === selectedDocId);


  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6 text-slate-200">
      {/* Top Banner & Legal Integrity Warning (Section 7) */}
      <div className="bg-slate-900/90 rounded-2xl p-6 border border-slate-800 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400 mb-1">
              <span>{selectedCase?.firNumber || 'FIR No. 284/2024'}</span>
              <span>•</span>
              <span>Extraction Review Station</span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2">
              <FileCheck className="w-5 h-5 text-amber-400" />
              <span>Document Extraction Review & Entity Validation</span>
            </h1>
          </div>

          <Link
            to={`/cases/${selectedCase?.id || 'FIR-284-2024'}/investigation`}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md transition-all self-start md:self-auto"
          >
            <span>Return to Investigation Canvas</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Section 7 Disclaimer: Do not visually imply unapproved extraction is a verified fact */}
        <div className="mt-4 p-3 rounded-xl bg-amber-950/40 border border-amber-800/80 flex items-start space-x-3 text-amber-300">
          <AlertOctagon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <strong className="uppercase font-bold tracking-wider block text-amber-300">
              Investigative Evidentiary Warning (Standard Operating Procedure):
            </strong>
            Unapproved candidates are automated AI/NER extractions from raw case documents. An unapproved extraction is <strong>NOT a verified fact</strong> and must not be cited in judicial charge sheets until corroborated and approved by the Investigating Officer.
          </div>
        </div>
      </div>

      {/* Document Selector & Entity Type Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/70 p-3 rounded-xl border border-slate-800">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono text-slate-400">Source Document:</span>
          <select
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
            className="bg-slate-950 text-xs font-mono text-slate-200 px-3 py-1.5 rounded-lg border border-slate-800 focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            {documents.length === 0 ? (
              <option value="">No uploaded documents</option>
            ) : documents.map((doc) => (
              <option key={doc.id} value={doc.id}>{doc.fileName}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-1 text-xs">
          <span className="text-slate-400 mr-2 text-[11px] font-mono">Filter by Type:</span>
          {['ALL', 'PERSON', 'PHONE', 'BANK_ACCOUNT', 'LOCATION', 'VEHICLE', 'ORGANIZATION', 'DEVICE_IMEI'].map((type) => (
            <button
              key={type}
              onClick={() => setActiveTypeFilter(type)}
              className={`px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                activeTypeFilter === type
                  ? 'bg-cyan-500 text-black font-bold'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Split-Screen: Original Document Text beside Extracted Candidates (Section 7) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Pane: Original Document Text with Chunk Highlighting */}
        <div className="bg-slate-900/90 rounded-2xl p-5 border border-slate-800 shadow-md flex flex-col h-[650px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Original Evidentiary Document Reader
              </h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              Verified Scan
            </span>
          </div>

          <div className="text-xs font-mono text-cyan-400 py-2">
            Viewing: {selectedDocument?.fileName || 'No document selected'}
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-300 select-text">
            {documentText}
          </div>

          <div className="pt-3 text-[10px] text-slate-500 font-mono flex items-center justify-between">
            <span>Backend status: {documentTextStatus || '—'}</span>
            <span>{selectedDocument?.fileSize || ''}</span>
          </div>
        </div>

        {/* Right Pane: Extracted Candidates Grouped by Entity Type (Section 7) */}
        <div className="bg-slate-900/90 rounded-2xl p-5 border border-slate-800 shadow-md flex flex-col h-[650px] overflow-hidden">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <FileCheck className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Candidate Entities ({filteredExtractions.length})
              </h3>
            </div>
            <span className="text-[10px] font-mono text-amber-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-800">
              {filteredExtractions.filter((e) => e.reviewStatus === 'PENDING').length} Pending IO Action
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 py-3 space-y-5">
            {Object.keys(groupedByType).length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                No extracted entities found for the selected filter.
              </div>
            ) : (
              (Object.keys(groupedByType) as EntityType[]).map((type) => {
                const candidates = groupedByType[type];

                return (
                  <div key={type} className="space-y-2.5">
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                        {type}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        ({candidates.length} candidates)
                      </span>
                    </div>

                    <div className="space-y-2">
                      {candidates.map((cand) => {
                        const isApproved = cand.reviewStatus === 'APPROVED';
                        const isRejected = cand.reviewStatus === 'REJECTED';
                        const isPending = cand.reviewStatus === 'PENDING';
                        const isEditing = editingCandidateId === cand.id;

                        return (
                          <div
                            key={cand.id}
                            className={`p-3.5 rounded-xl border transition-all ${
                              isApproved
                                ? 'bg-emerald-950/20 border-emerald-500/40 ring-1 ring-emerald-500/20'
                                : isRejected
                                ? 'bg-rose-950/20 border-rose-800/40 opacity-60'
                                : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 mr-3">
                                {isEditing ? (
                                  <div className="flex items-center space-x-2 my-1">
                                    <input
                                      type="text"
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      className="bg-slate-900 text-xs text-white px-2.5 py-1 rounded border border-cyan-500 focus:outline-none flex-1 font-mono"
                                    />
                                    <button
                                      onClick={() => saveEdit(cand.id)}
                                      className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs"
                                    >
                                      Save
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center space-x-2">
                                    <h4 className="text-xs font-bold text-white font-mono">
                                      {cand.standardizedValue}
                                    </h4>
                                    {cand.extractedValue !== cand.standardizedValue && (
                                      <span className="text-[10px] text-slate-500 italic">
                                        (Extracted: {cand.extractedValue})
                                      </span>
                                    )}
                                  </div>
                                )}

                                <p className="text-[11px] text-slate-400 mt-1 italic line-clamp-2">
                                  "{cand.chunkSnippet}"
                                </p>

                                <div className="mt-2 flex items-center space-x-3 text-[10px] font-mono text-slate-500">
                                  <span>Page {cand.pageNumber}</span>
                                  <span>•</span>
                                  <span>Confidence: <strong className="text-emerald-400">{(cand.confidence * 100).toFixed(0)}%</strong></span>
                                  {cand.reviewedBy && (
                                    <>
                                      <span>•</span>
                                      <span className="text-cyan-400">Reviewed by: {cand.reviewedBy}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Status Badge */}
                              <span
                                className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded ${
                                  isApproved
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : isRejected
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                }`}
                              >
                                {cand.reviewStatus}
                              </span>
                            </div>

                            {/* Action Buttons: Approve, Edit, Reject (Section 7) */}
                            <div className="mt-3 pt-2.5 border-t border-slate-900 flex items-center justify-end space-x-2">
                              {isPending && (
                                <>
                                  <button
                                    onClick={() => startEdit(cand)}
                                    className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                                  >
                                    <Edit3 className="w-3 h-3 text-cyan-400" />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    onClick={() => handleReject(cand.id)}
                                    className="flex items-center space-x-1 px-2.5 py-1 rounded bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 text-xs font-medium border border-rose-800/60 transition-colors"
                                  >
                                    <XCircle className="w-3 h-3 text-rose-400" />
                                    <span>Reject</span>
                                  </button>
                                  <button
                                    onClick={() => handleApprove(cand.id)}
                                    className="flex items-center space-x-1 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Approve & Verify</span>
                                  </button>
                                </>
                              )}

                              {isApproved && (
                                <span className="text-[10px] text-emerald-400 font-mono flex items-center space-x-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Verified into Investigation Graph</span>
                                </span>
                              )}

                              {isRejected && (
                                <span className="text-[10px] text-rose-400 font-mono">
                                  Candidate Discarded
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
