import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, X, CheckCircle2 } from "lucide-react";

interface ErrorBoxProps {
  message: string | null;
  type?: "error" | "success";
  onClose: () => void;
}

export default function ErrorBox({
  message,
  type = "error",
  onClose,
}: ErrorBoxProps) {
  const isError = type === "error";

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto", marginBottom: 20 }}
          exit={{ opacity: 0, y: -10, height: 0, marginBottom: 0 }}
          className="overflow-hidden w-full"
        >
          <div
            className={`border rounded-xl p-4 flex items-start gap-3 w-full backdrop-blur-md
            ${
              isError
                ? "bg-red-500/10 border-red-500/30"
                : "bg-[#10b981]/10 border-[#10b981]/30"
            }`}
          >
            {isError ? (
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-[#10b981] shrink-0 mt-0.5" />
            )}

            <div className="flex-1">
              <h3
                className={`font-semibold text-sm ${
                  isError ? "text-red-500" : "text-[#10b981]"
                }`}
              >
                {isError ? "Authentication Error" : "Success"}
              </h3>
              <p
                className={`text-sm mt-1 whitespace-pre-wrap ${
                  isError ? "text-red-200/80" : "text-emerald-200/80"
                }`}
              >
                {message}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={`transition-colors shrink-0 
                ${
                  isError
                    ? "text-red-400 hover:text-red-300"
                    : "text-emerald-400 hover:text-[#10b981]"
                }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
