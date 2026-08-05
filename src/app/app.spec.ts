import {
  TestBed
} from '@angular/core/testing';
import {
  provideHttpClient
} from '@angular/common/http';

import {
  App
} from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed
      .configureTestingModule({
        imports: [
          App
        ],
        providers: [
          provideHttpClient()
        ]
      })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture =
      TestBed.createComponent(App);

    const app =
      fixture.componentInstance;

    expect(app).toBeTruthy();
  });

  it('should render the payment search title', async () => {
    const fixture =
      TestBed.createComponent(App);

    fixture.detectChanges();

    await fixture.whenStable();

    const compiled =
      fixture.nativeElement as HTMLElement;

    expect(
      compiled.querySelector('h1')?.textContent
    ).toContain('Payment Search');
  });

  it('should contain referral and identity fields', () => {
    const fixture =
      TestBed.createComponent(App);

    fixture.detectChanges();

    const compiled =
      fixture.nativeElement as HTMLElement;

    expect(
      compiled.querySelector(
        '#referralNumber'
      )
    ).toBeTruthy();

    expect(
      compiled.querySelector(
        '#identityNumber'
      )
    ).toBeTruthy();
  });
});