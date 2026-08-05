import { CommonModule } from '@angular/common';
import {
  HttpClient,
  HttpErrorResponse
} from '@angular/common/http';
import {
  ChangeDetectorRef,
  Component,
  inject
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import {
  finalize,
  timeout,
  TimeoutError
} from 'rxjs';

declare global {
  interface Window {
    grecaptcha?: {
      ready(
        callback: () => void
      ): void;

      execute(
        siteKey: string,
        options: {
          action: string;
        }
      ): Promise<string>;
    };
  }
}

interface PaymentSearchResponse {
  paymentReference: string;
  paymentStatus: string;
  amount: number;
  dueDate: string;
}

interface BackendErrorResponse {
  message?: string;
  timestamp?: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly formBuilder =
    inject(FormBuilder);

  private readonly http =
    inject(HttpClient);

  private readonly changeDetector =
    inject(ChangeDetectorRef);

  /*
   * Classic Google reCAPTCHA v3 site key.
   *
   * Never place the secret key in Angular.
   */
  private readonly recaptchaSiteKey =
    '6LeXf1ItAAAAACxAsA4hZv-24cLzKP8SQ2SGWNpT';

  /*
   * This action must exactly match:
   *
   * app.recaptcha.expected-action
   *
   * in Spring Boot application.properties.
   */
  private readonly recaptchaAction =
    'public_payment_search';

  private readonly apiUrl =
    'http://localhost:8080/api/public-payments/search';

  loading = false;
  errorMessage = '';
  result: PaymentSearchResponse | null = null;

  readonly searchForm =
    this.formBuilder.nonNullable.group({
      referralNumber: [
        '',
        [
          Validators.required,
          Validators.pattern(
            /^[A-Za-z0-9-]{8,30}$/
          )
        ]
      ],

      identityNumber: [
        '',
        [
          Validators.required,
          Validators.pattern(
            /^[A-Za-z0-9]{6,20}$/
          )
        ]
      ]
    });

  async search(): Promise<void> {
    if (this.loading) {
      return;
    }

    this.errorMessage = '';
    this.result = null;

    if (this.searchForm.invalid) {
      this.searchForm.markAllAsTouched();

      this.errorMessage =
        'Please enter a valid referral number and identity number.';

      this.refreshView();
      return;
    }

    if (!this.isRecaptchaConfigured()) {
      this.errorMessage =
        'reCAPTCHA has not been configured yet.';

      this.refreshView();
      return;
    }

    if (!window.grecaptcha) {
      this.errorMessage =
        'reCAPTCHA has not loaded. Please refresh the page and try again.';

      this.refreshView();
      return;
    }

    this.loading = true;
    this.refreshView();

    try {
      const recaptchaToken =
        await this.executeRecaptchaWithTimeout();

      if (!recaptchaToken.trim()) {
        throw new Error(
          'Google returned an empty reCAPTCHA token.'
        );
      }

      this.sendSearchRequest(recaptchaToken);

    } catch (error: unknown) {
      console.error(
        'Unable to generate the reCAPTCHA token:',
        error
      );

      this.loading = false;
      this.errorMessage =
        'Verification could not be completed. Please try again.';

      this.refreshView();
    }
  }

  private isRecaptchaConfigured(): boolean {
    return this.recaptchaSiteKey.trim().length > 0;
  }

  private executeRecaptchaWithTimeout():
    Promise<string> {
    const recaptchaPromise =
      this.executeRecaptcha();

    const timeoutPromise =
      new Promise<string>((_, reject) => {
        window.setTimeout(() => {
          reject(
            new Error(
              'reCAPTCHA token generation timed out.'
            )
          );
        }, 10_000);
      });

    return Promise.race([
      recaptchaPromise,
      timeoutPromise
    ]);
  }

  private executeRecaptcha():
    Promise<string> {
    return new Promise<string>(
      (resolve, reject) => {
        const grecaptcha =
          window.grecaptcha;

        if (!grecaptcha) {
          reject(
            new Error(
              'The reCAPTCHA library is unavailable.'
            )
          );

          return;
        }

        grecaptcha.ready(() => {
          grecaptcha
            .execute(
              this.recaptchaSiteKey,
              {
                action:
                  this.recaptchaAction
              }
            )
            .then(resolve)
            .catch(reject);
        });
      }
    );
  }

  private sendSearchRequest(
    recaptchaToken: string
  ): void {
    const formValue =
      this.searchForm.getRawValue();

    const request = {
      referralNumber:
        formValue.referralNumber.trim(),

      identityNumber:
        formValue.identityNumber.trim(),

      recaptchaToken
    };

    this.http
      .post<PaymentSearchResponse>(
        this.apiUrl,
        request
      )
      .pipe(
        timeout(10_000),

        finalize(() => {
          this.loading = false;
          this.refreshView();
        })
      )
      .subscribe({
        next: (
          response: PaymentSearchResponse
        ) => {
          this.result = response;
          this.errorMessage = '';

          this.refreshView();
        },

        error: (
          error: unknown
        ) => {
          console.error(
            'Payment search request failed:',
            error
          );

          this.handleBackendError(error);
        }
      });
  }

  private handleBackendError(
    error: unknown
  ): void {
    if (error instanceof TimeoutError) {
      this.errorMessage =
        'The payment service took too long to respond. Please try again.';

      this.refreshView();
      return;
    }

    if (!(error instanceof HttpErrorResponse)) {
      this.errorMessage =
        'An unexpected error occurred. Please try again.';

      this.refreshView();
      return;
    }

    if (error.status === 429) {
      this.errorMessage =
        'Too many attempts. Please wait before trying again.';

      this.refreshView();
      return;
    }

    if (error.status === 0) {
      this.errorMessage =
        'The payment service did not respond. Please confirm that Spring Boot is running.';

      this.refreshView();
      return;
    }

    if (error.status >= 500) {
      this.errorMessage =
        'The payment service is temporarily unavailable. Please try again later.';

      this.refreshView();
      return;
    }

    const backendError =
      error.error as BackendErrorResponse | null;

    console.warn(
      'Public search was rejected:',
      backendError?.message ??
        'No backend error message returned.'
    );

    this.errorMessage =
      'The information entered does not match our records.';

    this.refreshView();
  }

  private refreshView(): void {
    this.changeDetector.markForCheck();
  }
}