/** Oracle REC.CANDIDATES link column max length. */
export const CANDIDATE_LINK_MAX_LEN = 1000;

/** Profile / compensation columns passed to REC.CANDIDATE_PKG create & update. */
export const CANDIDATE_PROFILE_PLSQL_ARGS = `
    p_current_salary      => :p_current_salary,
    p_portfolio_link      => :p_portfolio_link,
    p_github_link         => :p_github_link,
    p_willing_to_relocate => :p_willing_to_relocate`;
