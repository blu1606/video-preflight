"""Build an inspectable batch plan; no network client or implicit paid calls."""
import json


def plan(bank, features):
    if not bank:
        return {"status": "not_configured", "questions": [], "eligible": 0, "source": "not_run", "reason": "Chưa có bộ câu hỏi"}
    questions, payload_features, submitted = [], {}, []
    for row in bank["questions"]:
        required = row["required_features"]
        readiness = row["domain"] in ("viral", "conversion", "sku") and row["question"]["type"] == "score"
        missing = [key for key in required if features.get(key, {}).get("status") not in ("REAL", "INFERRED")
                   or features[key].get("value") is None or not features[key].get("evidence")]
        forbidden = [key for key in required if key.startswith(("performance.", "shop.", "post.views", "post.sales", "post.gmv"))]
        eligible = readiness and not missing and not forbidden
        question = {**row, "group": row["domain"], "status": "eligible" if eligible else "not_scored", "score": None,
                    "inputs": required if eligible else [], "missing_features": missing,
                    "reason": "Chưa gọi provider" if eligible else "Thiếu bằng chứng: " + ", ".join(missing) if missing else "Tách khỏi điểm sẵn sàng đăng"}
        questions.append(question)
        if eligible:
            payload_features.update({key: features[key] for key in required})
            submitted.append(row["question"])
    return {"status": "not_configured", "question_bank_version": bank["version"], "questions": questions,
            "eligible": len(submitted), "total": len(questions), "source": "not_run", "outcomes_included": False,
            "reason": "Đã nạp bộ câu hỏi; chưa tích hợp provider hoặc gửi request.",
            "request_preview": {"model": bank.get("model"), "input": json.dumps({"features": payload_features}, ensure_ascii=False), "questions": submitted},
            "batch_note": "Các câu đủ điều kiện sẽ gửi trong một batch; chưa có lượt gọi nào ở bản nền."}
