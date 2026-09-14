import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "transparent",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 3,
            top: 3,
            width: 18,
            height: 18,
            borderRadius: 5,
            background: "#70707d",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 11,
            top: 11,
            width: 18,
            height: 18,
            borderRadius: 5,
            background: "#ed7668",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
