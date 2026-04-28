/**
 * Anonymous PL/SQL for COMP.EMPLOYEE_COMPENSATION.edit_components + document binds.
 * String-only module (no DB driver).
 */

/**
 * Oracle fragment: JSON tri-state flag → rec.<outField> ('TRUE'|'FALSE').
 * @param {string} primaryKey literal JSON key
 * @param {string} fallbackKey literal JSON key
 * @param {string} outField t_component_rec attribute name
 */
function plsqlJsonTriFlagAssign(primaryKey, fallbackKey, outField) {
  const parseAndAssign = (key) => `
        BEGIN
          v_flag := UPPER(TRIM(o.get_string('${key}')));
        EXCEPTION
          WHEN OTHERS THEN
            v_flag := UPPER(
              TRIM(BOTH '"' FROM TRIM(TREAT(o.get('${key}') AS JSON_ELEMENT_T).to_string()))
            );
        END;
        rec.${outField} := CASE WHEN v_flag IN ('TRUE','1','Y','YES') THEN 'TRUE' ELSE 'FALSE' END;`;

  return `
      IF o.has('${primaryKey}') AND o.get_type('${primaryKey}') <> 'NULL' THEN${parseAndAssign(primaryKey)}
      ELSIF o.has('${fallbackKey}') AND o.get_type('${fallbackKey}') <> 'NULL' THEN${parseAndAssign(fallbackKey)}
      END IF;`;
}

/**
 * @param {number} docCount 0..N document bind slots in the anonymous block
 * @returns {string}
 */
export function buildEditComponentsPlsql(docCount) {
  let docBlock = '';
  for (let i = 0; i < docCount; i++) {
    docBlock += `
  l_docs.EXTEND;
  l_docs(l_docs.COUNT).file_name := :doc_fn_${i};
  l_docs(l_docs.COUNT).file_extension := :doc_fe_${i};
  l_docs(l_docs.COUNT).mime_type := :doc_mt_${i};
  l_docs(l_docs.COUNT).file_size_bytes := :doc_fs_${i};
  l_docs(l_docs.COUNT).file_content := :doc_fb_${i};
  l_docs(l_docs.COUNT).file_description := :doc_fd_${i};
  l_docs(l_docs.COUNT).active_flag := NVL(:doc_af_${i}, 'Y');
`;
  }

  return `
DECLARE
  l_tab COMP.EMPLOYEE_COMPENSATION.t_component_tab := COMP.EMPLOYEE_COMPENSATION.t_component_tab();
  l_docs COMP.EMPLOYEE_COMPENSATION.t_doc_tab := COMP.EMPLOYEE_COMPENSATION.t_doc_tab();
  j JSON_ARRAY_T := JSON_ARRAY_T(:components_json);
  l_success VARCHAR2(1) := 'N';
  l_message VARCHAR2(4000);
BEGIN
  FOR i IN 0 .. j.get_size() - 1 LOOP
    DECLARE
      o JSON_OBJECT_T := TREAT(j.get(i) AS JSON_OBJECT_T);
      rec COMP.EMPLOYEE_COMPENSATION.t_component_rec;
      v_start VARCHAR2(40);
      v_end VARCHAR2(40);
      v_flag VARCHAR2(20);
    BEGIN
      rec.component_id := o.get_number('component_id');
      IF o.has('plan_id') AND o.get_type('plan_id') <> 'NULL' THEN
        rec.plan_id := o.get_number('plan_id');
      ELSE
        rec.plan_id := NULL;
      END IF;
      rec.amount := o.get_number('amount');
      rec.currency_code := TRIM(UPPER(o.get_string('currency_code')));
      rec.adjustment_method := TRIM(o.get_string('adjustment_method'));
      v_start := TRIM(o.get_string('effective_start_date'));
      rec.effective_start_date := TO_DATE(SUBSTR(v_start, 1, 10), 'YYYY-MM-DD');
      IF NOT o.has('effective_end_date')
         OR o.get_type('effective_end_date') = 'NULL' THEN
        rec.effective_end_date := NULL;
      ELSE
        v_end := TRIM(o.get_string('effective_end_date'));
        IF v_end IS NULL OR LENGTH(v_end) < 10 THEN
          rec.effective_end_date := NULL;
        ELSE
          rec.effective_end_date := TO_DATE(SUBSTR(v_end, 1, 10), 'YYYY-MM-DD');
        END IF;
      END IF;
      IF NOT o.has('active_flag') OR o.get_type('active_flag') = 'NULL' THEN
        rec.active_flag := 'Y';
      ELSE
        rec.active_flag := SUBSTR(TRIM(UPPER(o.get_string('active_flag'))), 1, 1);
      END IF;

      -- Optional flags for edit_components (get_string first; quoted to_string fallback).
      ${plsqlJsonTriFlagAssign('replace_flag', 'replace', 'replace_flag')}
      ${plsqlJsonTriFlagAssign('delete_flag', 'delete', 'delete_flag')}
      l_tab.EXTEND;
      l_tab(l_tab.COUNT) := rec;
    END;
  END LOOP;
${docBlock}
  BEGIN
    COMP.EMPLOYEE_COMPENSATION.edit_components(
      p_enterprise_id        => :enterprise_id,
      p_employee_id          => :employee_id,
      p_plan_id              => :plan_id,
      p_adjustment_type      => :adjustment_type,
      p_effective_date       => :effective_date,
      p_reason_code          => :reason_code,
      p_budget_code          => :budget_code,
      p_justification_text   => :justification_text,
      p_performance_rating   => :performance_rating,
      p_internal_notes       => :internal_notes,
      p_components           => l_tab,
      p_docs                 => l_docs,
      p_updated_by           => :updated_by,
      x_success              => l_success,
      x_message              => l_message
    );
  EXCEPTION
    WHEN OTHERS THEN
      l_success := 'N';
      IF l_message IS NULL OR TRIM(l_message) IS NULL THEN
        l_message := 'Unable to process request';
      END IF;
  END;
  :x_success := NVL(l_success, 'N');
  :x_message := NVL(l_message, 'Unable to process request');
END;
`;
}
