export interface IRuleItem {
  /**
   * id of the rule, auto increment
   */
  id: number;
  /**
   * timestamp of when rule been created
   * * will be used as the id of the rule
   */
  createdAt: number;
  /**
   * domain of the rule, calculated from origin
   */
  domain: string;
  /**
   * origin of the rule
   */
  origin: string;
  /**
   * whether allow cors with credentials
   * * if `true`, the Access-Control-Allow-Origin will be set to the origin
   * * > which will allow cors with credentials(cookie, authorization header),
   * * > may increase privacy concerns
   * * if `false`, the Access-Control-Allow-Origin will be set to '*', cors with credentials will failed
   */
  credentials?: boolean;
  /**
   * user comment of the rule
   */
  comment?: string;
  /**
   * whether the rule is disabled, the rule is enabled by default
   */
  disabled?: boolean;
  /**
   * timestamp of when rule been updated
   */
  updatedAt: number;
}
