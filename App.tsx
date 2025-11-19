import React, { useState, useCallback, useRef } from 'react';
import { UploadStatus } from './types';
import FileUpload from './components/FileUpload';
import FileList from './components/FileList';
import Toast from './components/Toast';
import PreviewModal from './components/PreviewModal';
import { PDFDocument } from 'pdf-lib';

// const WEBHOOK_URL = 'https://mxvpeshal.app.n8n.cloud/webhook/SalesReviewAnalyst';
const WEBHOOK_URL = 'https://shyamindia.app.n8n.cloud/webhook/SalesReviewAnalyst';
const LOGO_URL = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTsmLVsLp5BvdBOMb1oqgOqV1EEhGu7TYtOig&s'

// Helper function to read a file as ArrayBuffer
const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

const App: React.FC = () => {
  const [sessionName, setSessionName] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ type: null, message: '' });

  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [compiledPdfBlob, setCompiledPdfBlob] = useState<Blob | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleFilesAdded = useCallback((newFiles: File[]) => {
    setFiles(prevFiles => {
      const uniqueNewFiles = newFiles.filter(
        newFile => !prevFiles.some(existingFile => existingFile.name === newFile.name && existingFile.size === newFile.size)
      );
      return [...prevFiles, ...uniqueNewFiles];
    });
  }, []);

  const handleRemoveFile = useCallback((fileToRemove: File) => {
    setFiles(prevFiles => prevFiles.filter(file => file !== fileToRemove));
  }, []);

  const handleToastClose = useCallback(() => {
    setUploadStatus({ type: null, message: '' });
  }, []);

  const handleClosePreview = useCallback(() => {
    setIsPreviewOpen(false);
    setCompiledPdfBlob(null);
  }, []);

  const handleReset = useCallback(() => {
    abortControllerRef.current?.abort();

    setSessionName('');
    setFiles([]);
    setIsProcessing(false);
    handleClosePreview();
    setUploadStatus({ type: null, message: '' });
  }, [handleClosePreview]);

  const handleCompileAndReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sessionName || files.length === 0 || isProcessing) {
      return;
    }

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsProcessing(true);
    setUploadStatus({ type: null, message: '' });

    try {
      const mergedPdf = await PDFDocument.create();

      for (const file of files) {
        if (signal.aborted) {
          throw new DOMException('Aborted by user', 'AbortError');
        }
        const fileBuffer = await readFileAsArrayBuffer(file);
        // All files are assumed to be PDFs as per FileUpload component filter
        const pdfToMerge = await PDFDocument.load(fileBuffer, { ignoreInvalidXRefTable: true } as any);

        const copiedPages = await mergedPdf.copyPages(pdfToMerge, pdfToMerge.getPageIndices());
        copiedPages.forEach(page => mergedPdf.addPage(page));
      }

      const mergedPdfBytes = await mergedPdf.save();
      const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });

      setCompiledPdfBlob(blob);
      setIsPreviewOpen(true);

    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log('File processing was aborted.');
      } else {
        const errorMessage = error instanceof Error ? `Failed to process files: ${error.message}` : 'An unknown error occurred during file processing.';
        setUploadStatus({ type: 'error', message: errorMessage });
      }
    } finally {
      if (!signal.aborted) {
        setIsProcessing(false);
      }
    }
  };

  const handleFinalSubmit = async () => {
    if (!compiledPdfBlob || !sessionName || isProcessing) return;

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsProcessing(true);

    try {
      const compiledFileName = `${sessionName.replace(/\s+/g, '_')}_compiled.pdf`;
      const compiledFile = new File([compiledPdfBlob], compiledFileName, { type: 'application/pdf' });

      const formData = new FormData();
      formData.append('sessionName', sessionName);
      formData.append('file', compiledFile, compiledFile.name);

      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        body: formData,
        signal: signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} ${response.statusText}. ${errorText}`);
      }

      setUploadStatus({ type: 'success', message: 'Upload successful! Your merged PDF was sent.' });
      setSessionName('');
      setFiles([]);
      handleClosePreview();

    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setUploadStatus({ type: 'error', message: 'Submission cancelled.' });
      } else {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        setUploadStatus({ type: 'error', message: errorMessage });
      }
    } finally {
      if (!signal.aborted) {
        setIsProcessing(false);
      }
    }
  };

  const isSubmitDisabled = !sessionName || files.length === 0 || isProcessing;

  const submitButtonText = () => {
    if (isProcessing && !isPreviewOpen) {
      return (
        <>
          <svg className="w-5 h-5 mr-3 -ml-1 text-white animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Processing Files...
        </>
      );
    }
    return 'Compile & Review Files';
  }

  return (
    <>
      <div className="relative flex flex-col min-h-screen font-sans text-white bg-black">
        <header className="absolute top-0 left-0 p-8 z-10">
          <img src={LOGO_URL} alt="Spectra Logo" className="h-12 w-auto" />
        </header>

        <main className="flex-grow flex items-center justify-center p-4">
          <div className="w-full max-w-2xl my-8 relative">
            <button
              onClick={handleReset}
              className="absolute top-2 right-2 z-10 px-3 py-1.5 text-sm font-semibold text-gray-300 transition-colors bg-gray-800/50 hover:bg-gray-700/70 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
              aria-label="Reset application"
            >
              Reset
            </button>

            <header className="mb-8 text-center">
              <h1 className="text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#00FF85] to-[#B45BFF]">
                Sales Review Analyst
              </h1>
              <p className="mt-2 text-lg text-gray-400">
                Upload one or more PDF documents for a comprehensive sales review analysis.
              </p>
            </header>

            <div className="w-full p-8 space-y-8 bg-slate-900/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-800">
              <form onSubmit={handleCompileAndReview} className="space-y-6">
                <div>
                  <label htmlFor="sessionName" className="block mb-2 text-sm font-medium text-gray-300">
                    1. Session Name
                  </label>
                  <input
                    id="sessionName"
                    type="text"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder="e.g., Q3 Sales Review"
                    required
                    className="w-full p-3 transition-colors duration-200 bg-gray-800 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#00FF85]"
                  />
                </div>

                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-300">
                    2. Upload Files
                  </label>
                  <FileUpload onFilesAdded={handleFilesAdded} />
                </div>

                {files.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-medium text-gray-300">Uploaded Files</h3>
                    <FileList files={files} onRemoveFile={handleRemoveFile} />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitDisabled}
                  className="w-full py-3 px-6 font-bold text-black transition-all duration-300 bg-[#00FF85] rounded-lg shadow-lg hover:bg-opacity-90 focus:outline-none focus:ring-4 focus:ring-[#00FF85]/50 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center"
                >
                  {submitButtonText()}
                </button>
              </form>
            </div>
          </div>
        </main>

        <footer className="w-full text-center py-4 text-sm text-gray-500 shrink-0">
          Developed by Spectra 
        </footer>
      </div>

      {uploadStatus.type && (
        <Toast status={uploadStatus} onClose={handleToastClose} />
      )}

      {isPreviewOpen && compiledPdfBlob && (
        <PreviewModal
          pdfBlob={compiledPdfBlob}
          onClose={handleClosePreview}
          onSubmit={handleFinalSubmit}
          isSubmitting={isProcessing}
        />
      )}
    </>
  );
};

export default App;