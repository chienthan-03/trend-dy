export const formatTtsFitWarning = (indexes: number[]): string => {
  if (indexes.length === 0) return "";

  const preview = indexes.slice(0, 6).join(", ");
  const extra =
    indexes.length > 6 ? ` và ${indexes.length - 6} dòng nữa` : "";

  return (
    `${indexes.length} dòng review vượt khung phụ đề gốc (dòng ${preview}${extra}). ` +
    "Bản dịch tiếng Việt dài hơn tiếng Trung — tăng «Khớp timeline tối đa» lên 1.75–2× rồi «Tạo audio VI» lại."
  );
};
