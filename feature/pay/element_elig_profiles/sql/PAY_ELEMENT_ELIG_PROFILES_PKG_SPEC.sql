CREATE OR REPLACE PACKAGE PAY.PAY_ELEMENT_ELIG_PROFILES_PKG AS

    PROCEDURE create_profile (
        p_enterprise_id              IN  NUMBER,
        p_profile_name               IN  VARCHAR2,
        p_profile_description        IN  VARCHAR2 DEFAULT NULL,
        p_status                     IN  VARCHAR2 DEFAULT 'ACTIVE',
        p_eligibility_rules_json     IN  CLOB,

        p_created_by                 IN  VARCHAR2,
        p_creation_date              IN  DATE,
        p_last_updated_by            IN  VARCHAR2,
        p_last_update_date           IN  DATE,

        x_success                    OUT VARCHAR2,
        x_message                    OUT VARCHAR2,
        x_profile_id                 OUT NUMBER,
        x_profile_guid               OUT VARCHAR2
    );

    PROCEDURE update_profile (
        p_enterprise_id              IN  NUMBER,
        p_profile_guid               IN  VARCHAR2,
        p_profile_name               IN  VARCHAR2,
        p_profile_description        IN  VARCHAR2 DEFAULT NULL,
        p_status                     IN  VARCHAR2 DEFAULT 'ACTIVE',
        p_eligibility_rules_json     IN  CLOB,

        p_last_updated_by            IN  VARCHAR2,
        p_last_update_date           IN  DATE,

        x_success                    OUT VARCHAR2,
        x_message                    OUT VARCHAR2
    );

    PROCEDURE delete_profile (
        p_enterprise_id              IN  NUMBER,
        p_profile_guid               IN  VARCHAR2,
        p_hard_delete                IN  VARCHAR2 DEFAULT 'N',

        p_last_updated_by            IN  VARCHAR2,
        p_last_update_date           IN  DATE,

        x_success                    OUT VARCHAR2,
        x_message                    OUT VARCHAR2
    );

    PROCEDURE set_status (
        p_enterprise_id              IN  NUMBER,
        p_profile_guid               IN  VARCHAR2,
        p_status                     IN  VARCHAR2,

        p_last_updated_by            IN  VARCHAR2,
        p_last_update_date           IN  DATE,

        x_success                    OUT VARCHAR2,
        x_message                    OUT VARCHAR2
    );

END PAY_ELEMENT_ELIG_PROFILES_PKG;
