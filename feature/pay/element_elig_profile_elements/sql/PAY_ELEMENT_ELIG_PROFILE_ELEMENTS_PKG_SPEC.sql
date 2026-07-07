CREATE OR REPLACE PACKAGE PAY.PAY_ELEMENT_ELIG_PROFILE_ELEMENTS_PKG AS

    PROCEDURE link_element (
        p_enterprise_id       IN  NUMBER,
        p_profile_guid        IN  VARCHAR2,
        p_element_guid        IN  VARCHAR2,

        p_created_by          IN  VARCHAR2,
        p_creation_date       IN  DATE,
        p_last_updated_by     IN  VARCHAR2,
        p_last_update_date    IN  DATE,

        x_success             OUT VARCHAR2,
        x_message             OUT VARCHAR2,
        x_profile_element_id  OUT NUMBER,
        x_profile_element_guid OUT VARCHAR2
    );

    PROCEDURE unlink_element (
        p_enterprise_id       IN  NUMBER,
        p_profile_guid        IN  VARCHAR2,
        p_element_guid        IN  VARCHAR2,

        x_success             OUT VARCHAR2,
        x_message             OUT VARCHAR2
    );

END PAY_ELEMENT_ELIG_PROFILE_ELEMENTS_PKG;
/
