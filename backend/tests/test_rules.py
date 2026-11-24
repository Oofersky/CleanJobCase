from app.services.rules import analyze_rules


def test_flags_flexible_schedule_and_gaps():
    vac = {
        "id": "t1",
        "job-name": "Специалист",
        "duty": "Короче.",
        "schedule": "Гибкий график",
        "salary": "конкурентная зарплата",
        "employment": "",
        "requirements": "",
        "addresses": {"address": []},
    }
    remarks = analyze_rules(vac)
    kinds = {r.kind for r in remarks}
    topics = {r.topic for r in remarks}
    assert "gap" in kinds
    assert "ambiguity" in kinds
    assert "график" in topics
    assert "оплата" in topics
    assert "место работы" in topics
    assert all(r.recommendation.endswith("?") for r in remarks)
    assert not any(r.recommendation.lower().startswith(("укажите", "добавьте")) for r in remarks)


def test_structured_pay_without_text_repeat_is_ok():
    vac = {
        "id": "t2",
        "job-name": "Инженер",
        "duty": "Поверка средств измерений и оформление протоколов по регламенту организации.",
        "salary_min": 45000,
        "salary_max": 60000,
        "salary": "",
        "schedule": "Полный рабочий день",
        "employment": "Полная занятость",
        "requirements": "Высшее",
        "requirement": {"education": "Высшее", "experience": 1},
        "addresses": {"address": [{"location": "г. Калининград"}]},
    }
    remarks = analyze_rules(vac)
    assert not any(r.topic == "оплата" and r.kind == "gap" for r in remarks)
