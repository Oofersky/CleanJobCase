from app.schemas import AnalysisReport, ReportSummary


def test_report_has_optional_id():
    report = AnalysisReport(
        generated_at="2026-01-01T00:00:00+00:00",
        source="fixture",
        vacancies_processed=0,
        pages_fetched=0,
        vacancies=[],
    )
    assert report.id is None
    with_id = report.model_copy(update={"id": 7})
    assert with_id.id == 7


def test_report_summary_shape():
    item = ReportSummary(
        id=3,
        created_at="2026-11-24T12:00:00+00:00",
        source="api",
        vacancies_processed=10,
        ai_used=True,
        has_error=False,
    )
    assert item.id == 3
    assert "api" in item.source
