package app.gomdori.kordoc;

import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Path;
import java.util.Objects;

/**
 * 로컬 OCR 모델 파일 — {@link ParseOptions.Builder#ocrDet(OcrModelFile)}·{@code ocrRec}·{@code ocrRecDict} 에 준다.
 * 엔진이 로드 전에 SHA-256 을 대조하고 다르면 거부한다. 상대 경로는 이 JVM 의 현재 디렉터리 기준 절대 경로로 바꿔 보낸다.
 *
 * @param path 모델 파일 경로
 * @param sha256 기대 SHA-256 (16진 64자)
 */
public record OcrModelFile(Path path, String sha256) {
    public OcrModelFile {
        Objects.requireNonNull(path, "path");
        Objects.requireNonNull(sha256, "sha256");
    }

    /** wire {path(절대), sha256} */
    ObjectNode toWire() {
        ObjectNode o = Json.MAPPER.createObjectNode();
        o.put("path", path.toAbsolutePath().toString());
        o.put("sha256", sha256);
        return o;
    }
}
