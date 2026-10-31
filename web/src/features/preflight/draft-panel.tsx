import { useEffect, useState } from "react";
import { UploadCloud, Save, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { platforms } from "./types";
import type { Sku, Video } from "./types";
export function DraftPanel({
  video,
  skus,
  close,
}: {
  video: Video;
  skus: Sku[];
  close: () => void;
}) {
  const [saved] = useState<Record<string, unknown>>(() => {
    try {
      const value = JSON.parse(
        localStorage.getItem(`preflight:draft:${video.id}`) ?? "{}",
      );
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    } catch {
      return {};
    }
  });
  const initial = (key: string, fallback = "") =>
    typeof saved[key] === "string" ? String(saved[key]) : fallback;
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [caption, setCaption] = useState(
    initial("caption", video.post?.caption ?? ""),
  );
  const [tags, setTags] = useState(
    Array.isArray(saved.hashtags)
      ? saved.hashtags.filter((tag) => typeof tag === "string").join(" ")
      : (video.post?.hashtags?.join(" ") ?? ""),
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function save(form: HTMLFormElement, download: boolean) {
    setError("");
    setMessage("");
    const values = new FormData(form);
    const hashtags = [
      ...new Set(
        tags
          .split(/[\s,]+/)
          .map((tag) => tag.replace(/^#/, ""))
          .filter(Boolean),
      ),
    ];
    if (hashtags.length > 30) {
      setError("Tối đa 30 hashtag.");
      return;
    }
    if (!values.getAll("platforms").length) {
      setError("Chọn ít nhất một nền tảng.");
      return;
    }
    const draft = {
      ...Object.fromEntries(values),
      platforms: values.getAll("platforms"),
      caption,
      hashtags,
      file_name:
        (file?.name ?? initial("file_name", video.local_file ?? "")) || null,
      scope: "local-draft",
      source_video: video.id,
    };
    try {
      localStorage.setItem(
        `preflight:draft:${video.id}`,
        JSON.stringify(draft),
      );
      if (download) {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(draft, null, 2)], {
            type: "application/json",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = `draft-${video.id}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setMessage(
        "Đã lưu bản nháp trên trình duyệt này. File video không được tải lên; kết quả cũ không thay đổi.",
      );
    } catch {
      setError(
        "Trình duyệt không cho phép lưu bản nháp. Kiểm tra quyền lưu trữ.",
      );
    }
  }
  return (
    <section className="draft-panel panel">
      <div className="section-heading">
        <div>
          <h2>Chuẩn bị video</h2>
          <p className="muted">
            Bản nháp local. Chưa kết nối dịch vụ phân tích.
          </p>
        </div>
        <Button variant="outline" onClick={close}>
          Đóng
        </Button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save(event.currentTarget, false);
        }}
      >
        <div className="draft-columns">
          <div>
            <label className="upload-zone">
              <UploadCloud size={32} />
              <strong>
                {file?.name ??
                  (initial("file_name")
                    ? `Bản nháp: ${initial("file_name")}`
                    : "Chọn video từ máy")}
              </strong>
              <span>
                MP4, MOV, WEBM, MKV · chọn lại file để xem trước sau khi mở lại
              </span>
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm,.mkv"
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (!selected) return;
                  if (!/\.(mp4|mov|webm|mkv)$/i.test(selected.name)) {
                    setError("Định dạng video chưa được hỗ trợ.");
                    return;
                  }
                  setError("");
                  setFile(selected);
                  setPreview(URL.createObjectURL(selected));
                }}
              />
            </label>
            {preview && (
              <video
                className="draft-video"
                src={preview}
                controls
                onError={() =>
                  setError(
                    "Trình duyệt không phát được định dạng này. Thử MP4 hoặc WEBM.",
                  )
                }
              />
            )}
            <label>
              SKU gắn giỏ hàng
              <select
                name="sku_id"
                defaultValue={initial("sku_id", video.sku_id)}
              >
                {skus.map((sku) => (
                  <option key={sku.id} value={sku.id}>
                    {sku.item_name}
                  </option>
                ))}
              </select>
            </label>
            <details>
              <summary>Nhập listing thủ công / link Shopee</summary>
              <label>
                Tên sản phẩm
                <input
                  name="listing_name"
                  defaultValue={initial("listing_name")}
                />
              </label>
              <label>
                Link sản phẩm
                <input
                  type="url"
                  name="listing_url"
                  defaultValue={initial("listing_url")}
                  placeholder="https://shopee.vn/…"
                />
              </label>
              <label>
                Giá (VND)
                <input
                  type="number"
                  min="0"
                  name="price_vnd"
                  defaultValue={initial("price_vnd")}
                />
              </label>
              <p className="small muted">
                Lưu link vào bản nháp; chưa có dịch vụ lấy listing tự động.
              </p>
            </details>
          </div>
          <div>
            <label htmlFor="draft-caption">Mô tả video</label>
            <textarea
              id="draft-caption"
              aria-label="Mô tả video"
              maxLength={2200}
              rows={5}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
            />
            <small>{caption.length}/2200</small>
            <label>
              Hashtag
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </label>
            <fieldset>
              <legend>Nơi đăng</legend>
              {Object.entries(platforms).map(([key, title]) => (
                <label className="checkbox-field" key={key}>
                  <input
                    type="checkbox"
                    name="platforms"
                    value={key}
                    defaultChecked={
                      Array.isArray(saved.platforms)
                        ? saved.platforms.includes(key)
                        : key === "tiktok_shop_video"
                    }
                  />
                  {title}
                </label>
              ))}
            </fieldset>
            <label>
              Người đăng
              <select
                name="sponsorship"
                defaultValue={initial("sponsorship", "own_shop")}
              >
                <option value="own_shop">Shop của tôi</option>
                <option value="affiliate">Affiliate</option>
                <option value="sponsored">Được tài trợ</option>
              </select>
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                name="disclosure_enabled"
                defaultChecked={saved.disclosure_enabled === "on"}
              />
              Sẽ bật nhãn quan hệ đối tác trả phí
            </label>
          </div>
        </div>
        <details>
          <summary>Mục tiêu & ngữ cảnh</summary>
          <div className="draft-columns">
            <label>
              Mục tiêu
              <select name="goal" defaultValue={initial("goal", "conversion")}>
                <option value="conversion">Tăng chuyển đổi</option>
                <option value="awareness">Tăng nhận biết</option>
                <option value="policy">Kiểm tra Policy</option>
              </select>
            </label>
            <label>
              Ngân sách (VND)
              <input
                type="number"
                min="0"
                name="budget_vnd"
                defaultValue={initial("budget_vnd")}
              />
            </label>
            <label>
              Chiến dịch
              <input name="campaign" defaultValue={initial("campaign")} />
            </label>
            <label>
              Câu hỏi cho lần phân tích sau
              <input
                name="user_query"
                defaultValue={initial("user_query")}
                list="questions"
              />
              <datalist id="questions">
                <option value="Vì sao người xem chưa bấm giỏ hàng?" />
                <option value="Hook có đủ rõ trong 3 giây đầu?" />
                <option value="Claim nào cần bằng chứng?" />
              </datalist>
            </label>
          </div>
        </details>
        <p className="notice-inline">
          Phân tích mới, AI quick-fill và duyệt đăng cần backend. Thay đổi bản
          nháp không áp dụng vào điểm đã lưu.
        </p>
        {error && (
          <p role="alert" className="warning-text">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="success-text">
            {message}
          </p>
        )}
        <div className="actions">
          <Button type="submit">
            <Save />
            Lưu bản nháp local
          </Button>
          <Button
            variant="outline"
            type="button"
            onClick={(event) => {
              const form = event.currentTarget.form;
              if (form?.reportValidity()) save(form, true);
            }}
          >
            <Download />
            Xuất JSON
          </Button>
        </div>
      </form>
    </section>
  );
}
