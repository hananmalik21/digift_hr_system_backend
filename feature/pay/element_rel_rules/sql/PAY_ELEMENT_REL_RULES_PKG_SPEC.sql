-- =============================================================================
-- PAY.PAY_ELEMENT_REL_RULES_PKG — spec
-- CRUD for PAY.PAY_ELEMENT_REL_RULES (element relationship / eligibility rules).
-- Does not COMMIT; caller owns the transaction.
-- =============================================================================

CREATE OR REPLACE PACKAGE PAY.PAY_ELEMENT_REL_RULES_PKG AS

    PROCEDURE CREATE_RULE (
        P_ELEMENT_ID               IN  NUMBER,
        P_ENTERPRISE_ID            IN  NUMBER,
        P_SCOPE_CONFIGURATION_CODE IN  VARCHAR2,
        P_PAYROLL_ID               IN  NUMBER   DEFAULT NULL,
        P_ORG_UNIT_GUID            IN  VARCHAR2 DEFAULT NULL,
        P_GRADE_ID                 IN  NUMBER   DEFAULT NULL,
        P_POSITION_GUID            IN  VARCHAR2 DEFAULT NULL,
        P_ACTIVE_FLAG              IN  VARCHAR2 DEFAULT 'Y',
        P_CREATED_BY               IN  VARCHAR2 DEFAULT NULL,
        P_RULE_ID                  OUT NUMBER,
        P_RULE_GUID                OUT VARCHAR2
    );

    PROCEDURE UPDATE_RULE (
        P_RULE_GUID                IN  VARCHAR2,
        P_SCOPE_CONFIGURATION_CODE IN  VARCHAR2,
        P_PAYROLL_ID               IN  NUMBER   DEFAULT NULL,
        P_ORG_UNIT_GUID            IN  VARCHAR2 DEFAULT NULL,
        P_GRADE_ID                 IN  NUMBER   DEFAULT NULL,
        P_POSITION_GUID            IN  VARCHAR2 DEFAULT NULL,
        P_ACTIVE_FLAG              IN  VARCHAR2 DEFAULT 'Y',
        P_UPDATED_BY               IN  VARCHAR2 DEFAULT NULL
    );

    PROCEDURE DELETE_RULE (
        P_RULE_GUID     IN  VARCHAR2,
        P_HARD_DELETE   IN  VARCHAR2 DEFAULT 'N',
        P_UPDATED_BY    IN  VARCHAR2 DEFAULT NULL
    );

END PAY_ELEMENT_REL_RULES_PKG;
/
