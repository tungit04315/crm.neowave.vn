/** Chuẩn hóa chuỗi để so khớp: bỏ dấu tiếng Việt, đ → d, chữ thường, ký tự lạ → khoảng trắng. */
export const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
