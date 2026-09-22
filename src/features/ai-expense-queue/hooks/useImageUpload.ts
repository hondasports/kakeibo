import { api } from "../../../../convex/_generated/api";
import { useRef, useState, type ChangeEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { getImageFileErrorMessage, resizeImageFileToDataUrl } from "../../../utils/imageDataUrl";
import type { AiExpenseUploadBatch } from "../types/types";

export function useImageUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [pendingImageDataUrls, setPendingImageDataUrls] = useState<Map<string, string>>(new Map());
  const [sessionBatches, setSessionBatches] = useState<AiExpenseUploadBatch[]>([]);
  const [pendingConsentFiles, setPendingConsentFiles] = useState<File[] | null>(null);
  const [consentStatus, setConsentStatus] = useState<"idle" | "saving">("idle");
  const [uploadError, setUploadError] = useState("");
  const [autoReviewJobId, setAutoReviewJobId] = useState<string | null>(null);

  const createBatch = useMutation(api.receiptAnalysisJobs.mutations.createBatch);
  const analyzeImageJob = useAction(api.receiptAnalysisJobs.actions.analyzeImageJob);
  const acceptReceiptImageExternalApiConsent = useMutation(
    api.users.mutations.acceptReceiptImageExternalApiConsent,
  );
  const receiptImageConsent = useQuery(api.users.queries.getReceiptImageConsent);

  const processFiles = async (files: File[]) => {
    let fileDataUrls: string[];
    try {
      fileDataUrls = await Promise.all(files.map(resizeImageFileToDataUrl));
    } catch (err) {
      setUploadError(getImageFileErrorMessage(err));
      return;
    }

    const result = await createBatch({ fileNames: files.map((f) => f.name) });
    if (!result) {
      setUploadError("画像の追加に失敗しました。もう一度お試しください。");
      return;
    }

    setSessionBatches((current) => [
      ...current,
      {
        batchId: result.batch._id,
        fileNames: files.map((file) => file.name),
        jobIds: result.jobs.map((job) => job._id),
      },
    ]);

    setPendingImageDataUrls((current) => {
      const nextPending = new Map(current);
      for (let i = 0; i < result.jobs.length; i++) {
        nextPending.set(result.jobs[i]._id, fileDataUrls[i]);
      }
      return nextPending;
    });
    setAutoReviewJobId(result.jobs.length === 1 ? result.jobs[0]._id : null);

    for (let i = 0; i < result.jobs.length; i++) {
      analyzeImageJob({ jobId: result.jobs[i]._id, imageDataUrl: fileDataUrls[i] }).catch(() => {
        // fire-and-forget: job failures update status via listJobs subscription and show in UI
      });
    }
  };

  const handleFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) {
      return;
    }

    try {
      if (receiptImageConsent?.hasAcceptedExternalApiConsent !== true) {
        setPendingConsentFiles(files);
        return;
      }

      await processFiles(files);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "画像の追加に失敗しました。もう一度お試しください。",
      );
    } finally {
      input.value = "";
    }
  };

  const handleAcceptConsent = async () => {
    if (!pendingConsentFiles || consentStatus === "saving") {
      return;
    }

    setConsentStatus("saving");
    setUploadError("");
    try {
      await acceptReceiptImageExternalApiConsent();
      const files = pendingConsentFiles;
      setPendingConsentFiles(null);
      await processFiles(files);
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : "同意状態を保存できませんでした。手入力をお試しください。",
      );
    } finally {
      setConsentStatus("idle");
    }
  };

  const handleDeclineConsent = () => {
    setPendingConsentFiles(null);
  };

  const removeSessionJob = (jobId: string) => {
    setSessionBatches((current) =>
      current
        .map((batch) => {
          const removedIndex = batch.jobIds.indexOf(jobId);
          if (removedIndex === -1) {
            return batch;
          }
          return {
            ...batch,
            fileNames: batch.fileNames.filter((_, index) => index !== removedIndex),
            jobIds: batch.jobIds.filter((id) => id !== jobId),
          };
        })
        .filter((batch) => batch.jobIds.length > 0),
    );
    setPendingImageDataUrls((current) => {
      if (!current.has(jobId)) {
        return current;
      }
      const next = new Map(current);
      next.delete(jobId);
      return next;
    });
  };

  return {
    cameraInputRef,
    consentIsLoading: receiptImageConsent === undefined,
    consentDialogOpen: pendingConsentFiles !== null,
    consentStatus,
    inputRef,
    pendingImageDataUrls,
    sessionBatches,
    autoReviewJobId,
    uploadError,
    setPendingImageDataUrls,
    setUploadError,
    setAutoReviewJobId,
    removeSessionJob,
    handleAcceptConsent,
    handleDeclineConsent,
    handleFilesSelected,
  };
}
