import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useInvestigation } from '../context/InvestigationContext';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Cpu,
  ArrowRight,
  ShieldCheck,
  Hash,
  Layers
} from 'lucide-react';

export const DocumentUploadView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { selectedCase, documents, uploadDocument } = useInvestigation();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await handleFileUpload(e.target.files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);

    if (!id) {
      setUploadError('No case ID was found in the URL.');
      setUploading(false);
      return;
    }

    try {
      await uploadDocument(file, id);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Document upload or processing failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8 text-slate-200">
      <div>
        <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400 mb-1">
          <span>{selectedCase?.firNumber || 'FIR No. 284/2024'}</span>
          <span>•</span>
          <span>Module 1 Ingestion Pipeline</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2.5">
          <UploadCloud className="w-6 h-6 text-cyan-400" />
          <span>Evidentiary Document Upload & Ingestion Status</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Ingest FIR complaint copies, CDR Excel sheets, Bank CSV statements, and CCTV memos into the CyberSaarthi OCR & NER pipeline.
        </p>
      </div>

      {/* Upload Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all bg-slate-900/60 backdrop-blur-sm ${
          isDragging
            ? 'border-cyan-400 bg-cyan-950/20 scale-[1.01]'
            : 'border-slate-800 hover:border-slate-700'
        }`}
      >
        <div className="max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center">
            <UploadCloud className="w-8 h-8 text-cyan-400 animate-bounce" />
          </div>

          <div>
            <h3 className="text-base font-bold text-white">
              Drag & Drop Investigation Records Here
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Supports PDF, Excel (.xlsx/.csv), JSON IPDR, or Seizure Memo Images
            </p>
          </div>

          <label className="inline-block cursor-pointer">
            <span className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-lg shadow-cyan-950/60 transition-all">
              {uploading ? 'Ingesting Document...' : 'Browse Local Files'}
            </span>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xlsx,.xlsm,.csv,.json,.txt,.md,.log,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff"
              onChange={handleFileSelect}
              disabled={uploading}
              className="hidden"
            />
          </label>

          <div className="flex items-center justify-center space-x-4 text-[11px] text-slate-500 font-mono pt-2">
            <span className="flex items-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>SHA-256 Hashing Active</span>
            </span>
            <span>•</span>
            <span className="flex items-center space-x-1">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>GPU OCR & Transformer NER</span>
            </span>
          </div>
        </div>
      </div>

      {uploadError && (
        <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/60 text-sm text-rose-300">
          <strong className="block text-rose-200 mb-1">Upload / processing failed</strong>
          {uploadError}
        </div>
      )}

      {/* Pipeline Status Tracker */}
      <div className="bg-slate-900/80 rounded-2xl p-6 border border-slate-800 shadow-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>Document Ingestion & Resolution Queue ({documents.length})</span>
          </h2>
          <span className="text-[10px] font-mono text-slate-400">
            Real-time Status Polling: Active
          </span>
        </div>

        <div className="space-y-3">
          {documents.map((doc) => {
            const isCompleted = doc.status === 'COMPLETED';
            const isFailed = doc.status === 'FAILED';

            return (
              <div
                key={doc.id}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800/90 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">{doc.fileName}</h4>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {doc.fileSize} • {doc.pageCount} Pages • Uploaded at {doc.uploadTimestamp}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-mono px-2.5 py-1 rounded font-bold ${
                      isCompleted
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : isFailed
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse'
                    }`}
                  >
                    {doc.status.replace('_', ' ')}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-slate-400">Pipeline Execution Progress</span>
                    <span className="text-cyan-400 font-bold">{doc.progressPercentage}%</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isCompleted ? 'bg-emerald-400' : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                      }`}
                      style={{ width: `${doc.progressPercentage}%` }}
                    />
                  </div>
                </div>

                {isFailed && doc.errorMessage && (
                  <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/60 text-[11px] text-rose-300">
                    <strong>Processing failed:</strong> {doc.errorMessage}
                  </div>
                )}

                {/* Sub-steps & Extraction link */}
                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-900">
                  <span className="text-[11px] text-slate-400">
                    Extracted <strong className="text-cyan-400">{doc.extractedCandidateCount}</strong> entity candidates
                  </span>

                  {isCompleted && (
                    <Link
                      to={`/cases/${selectedCase?.id || 'FIR-284-2024'}/extraction`}
                      className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold flex items-center space-x-1"
                    >
                      <span>Review Extracted Entities</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
