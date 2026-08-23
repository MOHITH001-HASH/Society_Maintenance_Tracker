import { X, Download, ZoomIn } from "lucide-react";

interface ImageLightboxModalProps {
  imageUrl: string | null;
  onClose: () => void;
  title?: string;
}

export default function ImageLightboxModal({ imageUrl, onClose, title = "Attached Media" }: ImageLightboxModalProps) {
  if (!imageUrl) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div 
        className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Action Bar */}
        <div className="w-full flex items-center justify-between text-white mb-3 px-2">
          <span className="text-sm font-semibold flex items-center">
            <ZoomIn className="w-4 h-4 mr-1.5 text-blue-400" />
            {title}
          </span>
          <div className="flex items-center space-x-2">
            <a
              href={imageUrl}
              target="_blank"
              rel="noreferrer"
              download
              className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold flex items-center transition"
            >
              <Download className="w-4 h-4 mr-1" /> Open Original
            </a>
            <button
              onClick={onClose}
              className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Media Frame */}
        <div className="bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center max-h-[80vh]">
          <img
            src={imageUrl}
            alt={title}
            className="max-h-[80vh] w-auto object-contain rounded-xl"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    </div>
  );
}
