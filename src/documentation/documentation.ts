import { Redirect } from 'aurelia-router';

export class Documentation {

  constructor() {
  }

  canActivate() {
    window.open("https://docs.primedao.io/", "_blank");
    return false;
  }
}
