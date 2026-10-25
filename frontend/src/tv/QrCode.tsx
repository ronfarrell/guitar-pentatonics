import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** A QR code for `value`, rendered as an image. Dark-on-white always: phone
 *  cameras read that most reliably, whatever the app theme is. */
export default function QrCode({ value, size, className }: { value: string; size: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: "M" })
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div className={`qr-code ${className ?? ""}`} style={{ width: size, height: size }}>
      {src && <img src={src} width={size} height={size} alt={`QR code for ${value}`} />}
    </div>
  );
}
