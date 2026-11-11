package app.gomdori.kordoc;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;

/**
 * 내장 OCR 이 읽은 쪽 하나의 줄({@link ParseResult#ocrLines()}). 좌표는 OCR 래스터 픽셀(왼쪽 위 원점, y 아래로)이다.
 * {@code scale} 은 래스터 px / PDF pt. 보정이나 PDF 회전이 있으면 이를 먼저 되돌려야 한다.
 *
 * @param deskewAngle 기울기 보정으로 래스터를 돌린 각(°). 좌표는 돌린 래스터 기준
 * @param regionsOnly 텍스트층이 있는 쪽이라 그림 영역만 읽었다
 * @param pageRotation 기울기 보정 뒤 OCR 방향을 맞추기 위한 반시계 회전각(0·90·270)
 */
public record OcrPageLines(int pageNumber, int width, int height, double scale, double deskewAngle, boolean regionsOnly, List<Line> lines, int pageRotation) {
    public OcrPageLines(int pageNumber, int width, int height, double scale, double deskewAngle, boolean regionsOnly, List<Line> lines) {
        this(pageNumber, width, height, scale, deskewAngle, regionsOnly, lines, 0);
    }
    /**
     * 줄 하나.
     *
     * @param confidence CTC 평균 신뢰도 0~1
     * @param dropped 저신뢰로 버려 블록에 들어가지 않은 줄 ({@code ocrLinesAll()} 일 때만 true 가 있다)
     */
    public record Line(String text, Box box, double confidence, boolean dropped) {}

    /** 잉크 외곽 상자 (래스터 px) */
    public record Box(double x, double y, double w, double h) {}

    static OcrPageLines fromJson(JsonNode n) {
        List<Line> lines = new ArrayList<>();
        for (JsonNode l : n.path("lines")) {
            JsonNode b = l.path("box");
            lines.add(new Line(l.path("text").asText(), new Box(b.path("x").asDouble(), b.path("y").asDouble(), b.path("w").asDouble(), b.path("h").asDouble()),
                    l.path("confidence").asDouble(), l.path("dropped").asBoolean(false)));
        }
        return new OcrPageLines(n.path("pageNumber").asInt(), n.path("width").asInt(), n.path("height").asInt(), n.path("scale").asDouble(),
                n.path("deskewAngle").asDouble(), n.path("regionsOnly").asBoolean(false), List.copyOf(lines), n.path("pageRotation").asInt(0));
    }
}
