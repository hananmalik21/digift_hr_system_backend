CREATE OR REPLACE PACKAGE PAY.PAY_ELEMENT_ELIGIBILITY_RULES_PKG AS

    PROCEDURE create_rule (
        p_enterprise_id          IN  NUMBER,
        p_rule_name              IN  VARCHAR2,
        p_criteria_values_json   IN  CLOB,
        p_effective_start_date   IN  DATE DEFAULT TRUNC(SYSDATE),
        p_effective_end_date     IN  DATE DEFAULT DATE '4712-12-31',
        p_status                 IN  VARCHAR2 DEFAULT 'ACTIVE',

        p_created_by             IN  VARCHAR2,
        p_creation_date          IN  DATE,
        p_last_updated_by        IN  VARCHAR2,
        p_last_update_date       IN  DATE,

        x_success                OUT VARCHAR2,
        x_message                OUT VARCHAR2,
        x_eligibility_rule_id    OUT NUMBER,
        x_eligibility_rule_guid  OUT VARCHAR2
    );

    PROCEDURE update_rule (
        p_enterprise_id          IN  NUMBER,
        p_eligibility_rule_guid  IN  VARCHAR2,
        p_rule_name              IN  VARCHAR2,
        p_criteria_values_json   IN  CLOB,
        p_effective_start_date   IN  DATE,
        p_effective_end_date     IN  DATE,
        p_status                 IN  VARCHAR2 DEFAULT 'ACTIVE',

        p_last_updated_by        IN  VARCHAR2,
        p_last_update_date       IN  DATE,

        x_success                OUT VARCHAR2,
        x_message                OUT VARCHAR2
    );

    PROCEDURE delete_rule (
        p_enterprise_id          IN  NUMBER,
        p_eligibility_rule_guid  IN  VARCHAR2,
        p_hard_delete            IN  VARCHAR2 DEFAULT 'N',

        p_last_updated_by        IN  VARCHAR2,
        p_last_update_date       IN  DATE,

        x_success                OUT VARCHAR2,
        x_message                OUT VARCHAR2
    );

    PROCEDURE set_status (
        p_enterprise_id          IN  NUMBER,
        p_eligibility_rule_guid  IN  VARCHAR2,
        p_status                 IN  VARCHAR2,

        p_last_updated_by        IN  VARCHAR2,
        p_last_update_date       IN  DATE,

        x_success                OUT VARCHAR2,
        x_message                OUT VARCHAR2
    );

END PAY_ELEMENT_ELIGIBILITY_RULES_PKG;
