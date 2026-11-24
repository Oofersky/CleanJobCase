import json
from pathlib import Path

from app.schemas import ResumeVacancyOption
from app.services.fetch import unwrap_vacancies
from app.services.resume_draft import (
    _rule_draft,
    build_sample_resume,
    dedupe_resume_options,
    vacancy_fingerprint,
)


DATA = Path(__file__).resolve().parents[1] / "data" / "fixtures"
FIXTURE_RESUME = DATA / "sample_resume.json"
FIXTURE_VACANCIES = DATA / "sample_vacancies.json"


def test_vacancy_fingerprint_ignores_quotes_and_case():
    a = vacancy_fingerprint("Инженер по метрологии", 'ФБУ "КАЛИНИНГРАДСКИЙ ЦСМ"')
    b = vacancy_fingerprint("Инженер по метрологии", "ФБУ «Калининградский ЦСМ»")
    assert a == b
    assert a


def test_dedupe_resume_options_prefers_live_over_demo():
    items = [
        ResumeVacancyOption(
            id="demo-gap-001",
            report_id=4,
            job_name="Инженер по метрологии",
            company_name="ФБУ «Калининградский ЦСМ»",
        ),
        ResumeVacancyOption(
            id="dfdfe7c6-1b0a-11ee-9f4d-9586bb63c653",
            report_id=7,
            job_name="Инженер по метрологии",
            company_name='ФБУ "КАЛИНИНГРАДСКИЙ ЦСМ"',
            duty="Поверка СИ",
        ),
    ]
    out = dedupe_resume_options(items)
    assert len(out) == 1
    assert out[0].id.startswith("dfdfe")
    assert out[0].duty == "Поверка СИ"


def test_rule_draft_uses_only_resume_facts():
    resume = json.loads(FIXTURE_RESUME.read_text(encoding="utf-8"))
    vac = next(v for v in unwrap_vacancies(json.loads(FIXTURE_VACANCIES.read_text(encoding="utf-8"))) if v["id"] == "demo-gap-001")
    result = _rule_draft(resume, vac)

    assert result.ai_used is False
    assert "Метрология" in result.draft_text
    assert "ПримерЛаборатория" in result.draft_text
    assert "вымышлен" not in result.draft_text.lower()
    experience_block = result.draft_text.split("Опыт работы", 1)[-1]
    assert "Калининградский ЦСМ" not in experience_block
    assert "ПримерЛаборатория" in experience_block
    assert any(s in {"Метрология", "Поверка СИ", "MS Office"} for s in result.matched_skills)
    assert "Инженер по метрологии" in result.draft_text


def test_sample_resume_follows_vacancy():
    vac = {
        "id": "x",
        "job-name": "Специалист по кадрам",
        "duty": "Кадровый документооборот; ведение личных дел.",
        "requirements": "1С; грамотная речь",
        "requirement": {"education": "Среднее профессиональное"},
        "company": {"name": "МУП «Пример»"},
    }
    sample = build_sample_resume(vac)
    assert sample["experience"][0]["role"] == "Специалист по кадрам"
    assert "кадрам" in sample["summary"].lower() or "Специалист" in sample["summary"]
    assert isinstance(sample["skills"], list) and sample["skills"]
    assert sample["education"][0]["degree"]


def test_rule_draft_empty_skills_still_keeps_experience():
    vac = {"id": "x", "job-name": "Специалист", "duty": "Кадровый учёт", "requirements": ""}
    resume = {
        "full_name": "Б. В.",
        "skills": [],
        "experience": [{"role": "Делопроизводитель", "company": "МУП", "period": "2020–2023", "details": "Документы"}],
        "education": [],
    }
    result = _rule_draft(resume, vac)
    assert "Делопроизводитель" in result.draft_text
    assert "МУП" in result.draft_text
