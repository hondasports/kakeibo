import { api } from "../../../../convex/_generated/api";
import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  normalizeReceiptExtraction,
  type NormalizedReceiptExtraction,
  type NormalizedReceiptFields,
} from "../validation/receiptExtraction";
import { resizeImageFileToDataUrl } from "../../../utils/imageDataUrl";

export type ExtractedReceiptFields = NormalizedReceiptFields;
export type ExtractedReceiptResult = Pick<NormalizedReceiptExtraction, "fields" | "fieldStatuses">;

type UseReceiptImageExtractionArgs = {
  onExtracted: (result: ExtractedReceiptResult) => void;
};

export function useReceiptImageExtraction({ onExtracted }: UseReceiptImageExtractionArgs) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parseStatus, setParseStatus] = useState<"idle" | "ready" | "parsing" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [noticeMessages, setNoticeMessages] = useState<string[]>([]);
  const [consentDialogOpen, setConsentDialogOpen] = useState(false);
  const [consentStatus, setConsentStatus] = useState<"idle" | "saving">("idle");

  const extractReceiptFields = useAction(
    api.receiptImageExtraction.extraction.extractReceiptFields,
  );
  const acceptReceiptImageExternalApiConsent = useMutation(
    api.users.mutations.acceptReceiptImageExternalApiConsent,
  );
  const receiptImageConsent = useQuery(api.users.queries.getReceiptImageConsent);

  const consentIsLoading = receiptImageConsent === undefined;
  const hasAcceptedExternalApiConsent = receiptImageConsent?.hasAcceptedExternalApiConsent === true;

  useEffect(() => {
    if (!selectedFile || !previewCanvasRef.current) {
      return;
    }

    let isCancelled = false;
    const canvas = previewCanvasRef.current;
    if (typeof createImageBitmap !== "function") {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const drawPreview = async () => {
      try {
        const bitmap = await createImageBitmap(selectedFile);
        if (isCancelled) {
          bitmap.close();
          return;
        }
        const maxWidth = 640;
        const maxHeight = 360;
        const scale = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height, 1);
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));
        canvas.width = w;
        canvas.height = h;
        context.clearRect(0, 0, w, h);
        context.drawImage(bitmap, 0, 0, w, h);
        bitmap.close();
      } catch {
        if (!isCancelled) {
          setParseStatus("error");
          setErrorMessage("画像プレビューを表示できませんでした。別の画像を選択してください。");
        }
      }
    };

    void drawPreview();

    return () => {
      isCancelled = true;
    };
  }, [selectedFile]);

  const clearSelectedImage = (options: { keepNotice?: boolean } = {}) => {
    setSelectedFile(null);
    setParseStatus("idle");
    setErrorMessage("");
    if (!options.keepNotice) {
      setNoticeMessages([]);
    }
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setSelectedFile(null);
      setParseStatus("error");
      setErrorMessage("画像ファイルを選択してください。");
      event.target.value = "";
      return;
    }
    setSelectedFile(file);
    setParseStatus("ready");
    setErrorMessage("");
    setNoticeMessages([]);
  };

  const runExtraction = async () => {
    if (!selectedFile || parseStatus === "parsing") {
      return;
    }
    setParseStatus("parsing");
    setErrorMessage("");

    try {
      const imageDataUrl = await resizeImageFileToDataUrl(selectedFile);
      const result = normalizeReceiptExtraction(await extractReceiptFields({ imageDataUrl }));
      onExtracted({ fields: result.fields, fieldStatuses: result.fieldStatuses });
      setNoticeMessages([...new Set(result.issueMessages)]);
      clearSelectedImage({ keepNotice: result.issueMessages.length > 0 });
    } catch (err) {
      setParseStatus("error");
      const message =
        err instanceof Error
          ? err.message
          : "画像の読み取りに失敗しました。手入力をお試しください。";
      setErrorMessage(message);
    }
  };

  const handleExtract = async () => {
    if (!selectedFile || parseStatus === "parsing" || consentIsLoading) {
      return;
    }

    if (!hasAcceptedExternalApiConsent) {
      setConsentDialogOpen(true);
      return;
    }

    await runExtraction();
  };

  const handleAcceptAndExtract = async () => {
    if (!selectedFile || consentStatus === "saving") {
      return;
    }

    setConsentStatus("saving");
    setErrorMessage("");
    try {
      await acceptReceiptImageExternalApiConsent();
      setConsentDialogOpen(false);
      await runExtraction();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "同意状態を保存できませんでした。手入力をお試しください。";
      setErrorMessage(message);
    } finally {
      setConsentStatus("idle");
    }
  };

  const handleDeclineConsent = () => {
    setConsentDialogOpen(false);
    clearSelectedImage();
  };

  const handleCloseConsentDialog = () => {
    setConsentDialogOpen(false);
  };

  return {
    clearSelectedImage,
    consentDialogOpen,
    consentIsLoading,
    consentStatus,
    errorMessage,
    handleAcceptAndExtract,
    handleCloseConsentDialog,
    handleDeclineConsent,
    handleExtract,
    handleImageChange,
    imageInputRef,
    noticeMessages,
    parseStatus,
    previewCanvasRef,
    selectedFile,
    setNoticeMessages,
  };
}
